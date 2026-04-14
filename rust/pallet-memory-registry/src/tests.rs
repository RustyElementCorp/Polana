use frame_support::{assert_noop, assert_ok};

use crate::{mock::*, pallet::Error, Anchors, MemoryCount};

fn valid_hash() -> Vec<u8> {
    b"637dc39cb37904792763ecd8da4484efc4c410e4961ba0e1f3d905cbf964fd5d".to_vec()
}

fn valid_memory_id() -> Vec<u8> {
    b"mem_mn64hhftpechsj3d5tmnuree57cmiehesyn2bypt3ec4x6le7voq".to_vec()
}

#[test]
fn register_memory_works() {
    new_test_ext().execute_with(|| {
        assert_ok!(MemoryRegistry::register_memory(
            RuntimeOrigin::signed(1),
            valid_memory_id(),
            valid_hash(),
            b"local_f2df5d4133c2d9cccf9004e77c2ff0ddf53088837afb5f5f038e36349ae00750".to_vec(),
            b"agent:test-fixture".to_vec(),
            Some(b"fixture-public-v1".to_vec()),
        ));

        let stored = Anchors::<Test>::iter().next().expect("anchor should exist").1;
        assert_eq!(stored.submitter, 1);
        assert_eq!(stored.registered_at, 1);
        assert_eq!(stored.memory_id.to_vec(), valid_memory_id());
        assert_eq!(MemoryCount::<Test>::get(), 1);
    });
}

#[test]
fn duplicate_memory_id_is_rejected() {
    new_test_ext().execute_with(|| {
        assert_ok!(MemoryRegistry::register_memory(
            RuntimeOrigin::signed(1),
            valid_memory_id(),
            valid_hash(),
            b"cid_a".to_vec(),
            b"agent:test-fixture".to_vec(),
            None,
        ));

        assert_noop!(
            MemoryRegistry::register_memory(
                RuntimeOrigin::signed(1),
                valid_memory_id(),
                valid_hash(),
                b"cid_b".to_vec(),
                b"agent:test-fixture".to_vec(),
                None,
            ),
            Error::<Test>::MemoryAlreadyRegistered
        );
    });
}

#[test]
fn invalid_hash_is_rejected() {
    new_test_ext().execute_with(|| {
        assert_noop!(
            MemoryRegistry::register_memory(
                RuntimeOrigin::signed(1),
                valid_memory_id(),
                b"not_a_valid_hash".to_vec(),
                b"cid_a".to_vec(),
                b"agent:test-fixture".to_vec(),
                None,
            ),
            Error::<Test>::InvalidCanonicalHash
        );
    });
}

#[test]
fn overly_long_field_is_rejected() {
    new_test_ext().execute_with(|| {
        let too_long = vec![b'a'; 300];
        assert_noop!(
            MemoryRegistry::register_memory(
                RuntimeOrigin::signed(1),
                valid_memory_id(),
                valid_hash(),
                too_long,
                b"agent:test-fixture".to_vec(),
                None,
            ),
            Error::<Test>::FieldTooLong
        );
    });
}
