use solana_program::program_error::ProgramError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MemoryMirrorError {
    InvalidInstruction = 0,
    MemoryIdMismatch = 1,
    InvalidCanonicalHash = 2,
    EmptyContentCid = 3,
    EmptyProducerId = 4,
}

impl From<MemoryMirrorError> for ProgramError {
    fn from(value: MemoryMirrorError) -> Self {
        ProgramError::Custom(value as u32)
    }
}
