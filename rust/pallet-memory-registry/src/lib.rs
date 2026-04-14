#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

use frame_support::pallet_prelude::*;
use scale_info::TypeInfo;

#[derive(Clone, Encode, Decode, Eq, PartialEq, Debug, TypeInfo, MaxEncodedLen)]
pub struct MemoryAnchor<AccountId, BlockNumber, BoundedString> {
    pub memory_id: BoundedString,
    pub canonical_hash_hex: BoundedString,
    pub content_cid: BoundedString,
    pub producer_id: BoundedString,
    pub policy_id: Option<BoundedString>,
    pub submitter: AccountId,
    pub registered_at: BlockNumber,
}

#[frame_support::pallet]
pub mod pallet {
    use super::*;
    use frame_support::dispatch::DispatchResult;
    use frame_system::pallet_prelude::*;

    pub type AnchorOf<T> = MemoryAnchor<
        <T as frame_system::Config>::AccountId,
        BlockNumberFor<T>,
        BoundedVec<u8, <T as Config>::MaxFieldLength>,
    >;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        #[pallet::constant]
        type MaxFieldLength: Get<u32>;
    }

    #[pallet::storage]
    #[pallet::getter(fn anchors)]
    pub type Anchors<T: Config> =
        StorageMap<_, Blake2_128Concat, BoundedVec<u8, T::MaxFieldLength>, AnchorOf<T>, OptionQuery>;

    #[pallet::storage]
    #[pallet::getter(fn memory_count)]
    pub type MemoryCount<T: Config> = StorageValue<_, u64, ValueQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        MemoryRegistered {
            memory_id: BoundedVec<u8, T::MaxFieldLength>,
            canonical_hash_hex: BoundedVec<u8, T::MaxFieldLength>,
            submitter: T::AccountId,
        },
    }

    #[pallet::error]
    pub enum Error<T> {
        MemoryAlreadyRegistered,
        FieldTooLong,
        InvalidMemoryId,
        InvalidCanonicalHash,
        EmptyContentCid,
        EmptyProducerId,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(10_000)]
        pub fn register_memory(
            origin: OriginFor<T>,
            memory_id: Vec<u8>,
            canonical_hash_hex: Vec<u8>,
            content_cid: Vec<u8>,
            producer_id: Vec<u8>,
            policy_id: Option<Vec<u8>>,
        ) -> DispatchResult {
            let submitter = ensure_signed(origin)?;

            ensure!(memory_id.starts_with(b"mem_"), Error::<T>::InvalidMemoryId);
            ensure!(
                canonical_hash_hex.len() == 64
                    && canonical_hash_hex
                        .iter()
                        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
                Error::<T>::InvalidCanonicalHash
            );
            ensure!(!content_cid.is_empty(), Error::<T>::EmptyContentCid);
            ensure!(!producer_id.is_empty(), Error::<T>::EmptyProducerId);

            let memory_id = bounded::<T>(memory_id)?;
            ensure!(!Anchors::<T>::contains_key(&memory_id), Error::<T>::MemoryAlreadyRegistered);

            let canonical_hash_hex = bounded::<T>(canonical_hash_hex)?;
            let content_cid = bounded::<T>(content_cid)?;
            let producer_id = bounded::<T>(producer_id)?;
            let policy_id = policy_id.map(bounded::<T>).transpose()?;

            let anchor = MemoryAnchor {
                memory_id: memory_id.clone(),
                canonical_hash_hex: canonical_hash_hex.clone(),
                content_cid,
                producer_id,
                policy_id,
                submitter: submitter.clone(),
                registered_at: frame_system::Pallet::<T>::block_number(),
            };

            Anchors::<T>::insert(&memory_id, anchor);
            MemoryCount::<T>::mutate(|count| *count = count.saturating_add(1));

            Self::deposit_event(Event::MemoryRegistered {
                memory_id,
                canonical_hash_hex,
                submitter,
            });

            Ok(())
        }
    }

    fn bounded<T: Config>(value: Vec<u8>) -> Result<BoundedVec<u8, T::MaxFieldLength>, Error<T>> {
        value.try_into().map_err(|_| Error::<T>::FieldTooLong)
    }
}

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;
