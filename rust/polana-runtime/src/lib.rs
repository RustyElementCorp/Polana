#![cfg_attr(not(feature = "std"), no_std)]

use frame_support::{construct_runtime, parameter_types};
use frame_system as system;
use sp_runtime::{
    BuildStorage,
    traits::{BlakeTwo256, IdentityLookup},
};

pub type AccountId = u64;
pub type Nonce = u64;
pub type BlockNumber = u64;
pub type Hash = sp_core::H256;
pub type Block = frame_system::mocking::MockBlock<Runtime>;

construct_runtime!(
    pub enum Runtime
    {
        System: frame_system,
        MemoryRegistry: pallet_memory_registry,
    }
);

parameter_types! {
    pub const BlockHashCount: BlockNumber = 250;
    pub const MaxFieldLength: u32 = 256;
}

impl system::Config for Runtime {
    type BaseCallFilter = frame_support::traits::Everything;
    type BlockWeights = ();
    type BlockLength = ();
    type DbWeight = ();
    type RuntimeOrigin = RuntimeOrigin;
    type RuntimeCall = RuntimeCall;
    type RuntimeTask = ();
    type RuntimeEvent = RuntimeEvent;
    type Block = Block;
    type Hash = Hash;
    type Hashing = BlakeTwo256;
    type AccountId = AccountId;
    type Lookup = IdentityLookup<Self::AccountId>;
    type Nonce = Nonce;
    type BlockHashCount = BlockHashCount;
    type Version = ();
    type PalletInfo = PalletInfo;
    type AccountData = ();
    type OnNewAccount = ();
    type OnKilledAccount = ();
    type SystemWeightInfo = ();
    type SS58Prefix = ();
    type OnSetCode = ();
    type MaxConsumers = frame_support::traits::ConstU32<16>;
    type ExtensionsWeightInfo = ();
    type SingleBlockMigrations = ();
    type MultiBlockMigrator = ();
    type PreInherents = ();
    type PostInherents = ();
    type PostTransactions = ();
}

impl pallet_memory_registry::pallet::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type MaxFieldLength = MaxFieldLength;
}

#[cfg(feature = "std")]
pub fn new_test_ext() -> sp_io::TestExternalities {
    let storage = frame_system::GenesisConfig::<Runtime>::default()
        .build_storage()
        .expect("frame system storage should build");
    let mut ext = sp_io::TestExternalities::new(storage);
    ext.execute_with(|| System::set_block_number(1));
    ext
}

#[cfg(test)]
mod tests {
    use frame_support::assert_ok;

    use super::*;

    #[test]
    fn runtime_registers_memory_anchor() {
        new_test_ext().execute_with(|| {
            assert_ok!(MemoryRegistry::register_memory(
                RuntimeOrigin::signed(1),
                b"mem_runtime_example".to_vec(),
                b"637dc39cb37904792763ecd8da4484efc4c410e4961ba0e1f3d905cbf964fd5d".to_vec(),
                b"local_runtime_example".to_vec(),
                b"agent:runtime-test".to_vec(),
                Some(b"runtime-policy-v1".to_vec()),
            ));

            assert_eq!(pallet_memory_registry::MemoryCount::<Runtime>::get(), 1);
        });
    }
}
