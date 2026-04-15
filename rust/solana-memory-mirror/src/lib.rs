pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

pub use error::MemoryMirrorError;
pub use instruction::MemoryMirrorInstruction;
pub use processor::{account_matches_memory_id, apply_instruction, memory_account_from_anchor};
pub use state::MemoryMirrorAccount;
