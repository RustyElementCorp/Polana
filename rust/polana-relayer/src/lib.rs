use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::Write,
    str::FromStr,
    path::Path,
};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64_STANDARD};
use polana_core::{anchor_payload_from_memory, AnchorPayload, MemoryObject};
use reqwest::blocking::Client as HttpClient;
use scale_decode::DecodeAsType;
use serde::{Deserialize, Serialize};
use solana_memory_mirror::MemoryMirrorInstruction;
use solana_program::{instruction::AccountMeta, pubkey::Pubkey};
use solana_sdk::{
    hash::Hash,
    instruction::Instruction,
    message::Message,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use subxt::{
    OnlineClient, OnlineClientAtBlock, SubstrateConfig, dynamic,
    ext::{codec::Decode, scale_value::Value},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaInstructionPreview {
    pub kind: String,
    pub memory_id: String,
    pub canonical_hash_hex: String,
    pub content_cid: String,
    pub producer_id: String,
    pub policy_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelayerPreview {
    pub anchor_payload: AnchorPayload,
    pub solana_instruction: SolanaInstructionPreview,
    pub instruction_bytes_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MirroredInstructionRecord {
    pub memory_id: String,
    pub source_chain: String,
    pub source_cursor: String,
    pub anchor_payload: AnchorPayload,
    pub solana_instruction: SolanaInstructionPreview,
    pub instruction_bytes_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnchorEnvelope {
    pub source_chain: String,
    pub source_cursor: String,
    pub anchor_payload: AnchorPayload,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelayCheckpoint {
    pub mirrored_memory_ids: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelayOutcome {
    pub memory_id: String,
    pub skipped: bool,
    pub sink_path: String,
    pub checkpoint_path: String,
}

pub trait AnchorSource {
    fn next_anchor_envelope(&mut self) -> Result<Option<AnchorEnvelope>, String>;
}

pub trait MirrorSink {
    fn write_instruction_record(&mut self, record: &MirroredInstructionRecord) -> Result<(), String>;
}

pub trait SubstrateAnchorClient {
    fn fetch_memory_registered_events(
        &self,
        config: &SubstrateAnchorSourceConfig,
        from_block: u64,
    ) -> Result<Vec<SubstrateMemoryRegisteredEvent>, String>;

    fn fetch_registry_anchor(
        &self,
        config: &SubstrateAnchorSourceConfig,
        memory_id: &str,
    ) -> Result<Option<SubstrateRegistryAnchor>, String>;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubstrateAnchorSourceConfig {
    pub chain_name: String,
    pub ws_url: String,
    pub pallet_name: String,
    pub event_name: String,
    pub storage_entry_name: String,
    pub start_block: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubstrateMemoryRegisteredEvent {
    pub block_number: u64,
    pub event_index: u32,
    pub memory_id: String,
    pub canonical_hash_hex: String,
    pub submitter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubstrateRegistryAnchor {
    pub memory_id: String,
    pub canonical_hash_hex: String,
    pub content_cid: String,
    pub producer_id: String,
    pub policy_id: Option<String>,
    pub submitter: String,
    pub registered_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaRpcMirrorSinkConfig {
    pub rpc_url: String,
    pub program_id: String,
    pub authority_keypair_path: String,
    pub authority_pubkey: String,
    pub mirror_account_pubkey: String,
    pub outbox_path: Option<String>,
    pub recent_blockhash_override: Option<String>,
    pub submit_rpc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaAccountMetaPreview {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaMirrorTransactionPreview {
    pub rpc_url: String,
    pub program_id: String,
    pub authority_pubkey: String,
    pub mirror_account_pubkey: String,
    pub instruction_name: String,
    pub accounts: Vec<SolanaAccountMetaPreview>,
    pub instruction_data_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaSignedTransactionPreview {
    pub rpc_url: String,
    pub signer_pubkey: String,
    pub recent_blockhash: String,
    pub transaction_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SolanaRpcRequestPreview {
    pub rpc_url: String,
    pub method: String,
    pub params: serde_json::Value,
}

pub struct JsonlAnchorSource {
    records: Vec<AnchorEnvelope>,
    cursor: usize,
}

pub struct JsonlMirrorSink {
    path: String,
}

pub struct SubstrateAnchorSource {
    config: SubstrateAnchorSourceConfig,
    events: Vec<SubstrateMemoryRegisteredEvent>,
    registry: BTreeMap<String, SubstrateRegistryAnchor>,
    cursor: usize,
}

pub struct MockSubstrateAnchorClient {
    pub events: Vec<SubstrateMemoryRegisteredEvent>,
    pub registry: BTreeMap<String, SubstrateRegistryAnchor>,
}

pub struct SubxtSubstrateAnchorClient {
    client: OnlineClient<SubstrateConfig>,
}

pub struct SolanaRpcMirrorSink {
    config: SolanaRpcMirrorSinkConfig,
}

#[derive(Debug, DecodeAsType)]
struct DynamicRegistryAnchorRecord {
    memory_id: Vec<u8>,
    canonical_hash_hex: Vec<u8>,
    content_cid: Vec<u8>,
    producer_id: Vec<u8>,
    policy_id: Option<Vec<u8>>,
    submitter: Value,
}

impl JsonlAnchorSource {
    pub fn from_jsonl_path(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let raw = fs::read_to_string(path)
            .map_err(|err| format!("failed to read anchor source {}: {err}", path.display()))?;
        let mut records = Vec::new();

        for (index, line) in raw.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(envelope) = serde_json::from_str::<AnchorEnvelope>(trimmed) {
                records.push(envelope);
                continue;
            }

            let payload: AnchorPayload = serde_json::from_str(trimmed).map_err(|err| {
                format!(
                    "failed to parse anchor source {} line {}: {err}",
                    path.display(),
                    index + 1
                )
            })?;
            records.push(AnchorEnvelope {
                source_chain: "jsonl-anchor-source".into(),
                source_cursor: format!("line:{}", index + 1),
                anchor_payload: payload,
            });
        }

        Ok(Self { records, cursor: 0 })
    }
}

impl AnchorSource for JsonlAnchorSource {
    fn next_anchor_envelope(&mut self) -> Result<Option<AnchorEnvelope>, String> {
        if self.cursor >= self.records.len() {
            return Ok(None);
        }

        let payload = self.records[self.cursor].clone();
        self.cursor += 1;
        Ok(Some(payload))
    }
}

impl JsonlMirrorSink {
    pub fn new(path: impl Into<String>) -> Self {
        Self { path: path.into() }
    }
}

impl MirrorSink for JsonlMirrorSink {
    fn write_instruction_record(&mut self, record: &MirroredInstructionRecord) -> Result<(), String> {
        append_instruction_record(&self.path, record)
    }
}

impl SubstrateAnchorSource {
    pub fn new(config: SubstrateAnchorSourceConfig) -> Self {
        Self {
            config,
            events: Vec::new(),
            registry: BTreeMap::new(),
            cursor: 0,
        }
    }

    pub fn from_mock_data(
        config: SubstrateAnchorSourceConfig,
        events: Vec<SubstrateMemoryRegisteredEvent>,
        registry_entries: Vec<SubstrateRegistryAnchor>,
    ) -> Self {
        let registry = registry_entries
            .into_iter()
            .map(|entry| (entry.memory_id.clone(), entry))
            .collect();

        Self {
            config,
            events,
            registry,
            cursor: 0,
        }
    }

    pub fn poll_once<C: SubstrateAnchorClient>(
        client: &C,
        config: SubstrateAnchorSourceConfig,
    ) -> Result<Self, String> {
        let from_block = config.start_block.unwrap_or(0);
        let events = client.fetch_memory_registered_events(&config, from_block)?;
        let mut registry = BTreeMap::new();

        for event in &events {
            let anchor = client
                .fetch_registry_anchor(&config, &event.memory_id)?
                .ok_or_else(|| {
                    format!(
                        "registry lookup missing memory {} for {} {}",
                        event.memory_id, config.pallet_name, config.event_name
                    )
                })?;
            registry.insert(event.memory_id.clone(), anchor);
        }

        Ok(Self {
            config,
            events,
            registry,
            cursor: 0,
        })
    }
}

impl AnchorSource for SubstrateAnchorSource {
    fn next_anchor_envelope(&mut self) -> Result<Option<AnchorEnvelope>, String> {
        if self.cursor >= self.events.len() {
            if self.events.is_empty() {
                return Err(format!(
                    "substrate anchor source not implemented yet for {} at {}",
                    self.config.chain_name, self.config.ws_url
                ));
            }
            return Ok(None);
        }

        let event = self.events[self.cursor].clone();
        self.cursor += 1;
        let anchor = self
            .registry
            .get(&event.memory_id)
            .ok_or_else(|| {
                format!(
                    "registry lookup missing memory {} for {} {}",
                    event.memory_id, self.config.pallet_name, self.config.event_name
                )
            })?
            .clone();

        Ok(Some(anchor_envelope_from_substrate_event(
            &self.config.chain_name,
            &event,
            &anchor,
        )?))
    }
}

impl SubstrateAnchorClient for MockSubstrateAnchorClient {
    fn fetch_memory_registered_events(
        &self,
        _config: &SubstrateAnchorSourceConfig,
        from_block: u64,
    ) -> Result<Vec<SubstrateMemoryRegisteredEvent>, String> {
        Ok(self
            .events
            .iter()
            .filter(|event| event.block_number >= from_block)
            .cloned()
            .collect())
    }

    fn fetch_registry_anchor(
        &self,
        _config: &SubstrateAnchorSourceConfig,
        memory_id: &str,
    ) -> Result<Option<SubstrateRegistryAnchor>, String> {
        Ok(self.registry.get(memory_id).cloned())
    }
}

impl SubxtSubstrateAnchorClient {
    pub async fn from_config(config: &SubstrateAnchorSourceConfig) -> Result<Self, String> {
        let client = OnlineClient::<SubstrateConfig>::from_url(config.ws_url.clone())
            .await
            .map_err(|error| format!("failed to connect to {}: {error}", config.ws_url))?;
        Ok(Self { client })
    }

    pub async fn poll_source_once(
        &self,
        config: SubstrateAnchorSourceConfig,
    ) -> Result<SubstrateAnchorSource, String> {
        let from_block = config.start_block.unwrap_or(0);
        let mut blocks = self
            .client
            .stream_blocks()
            .await
            .map_err(|error| format!("failed to stream blocks from {}: {error}", config.ws_url))?;

        while let Some(block) = blocks.next().await {
            let block = block.map_err(|error| format!("failed to fetch block: {error}"))?;
            let block_number: u64 = block.number().into();
            if block_number < from_block {
                continue;
            }

            let at_block = block
                .at()
                .await
                .map_err(|error| format!("failed to access block {block_number}: {error}"))?;
            let events = at_block
                .events()
                .fetch()
                .await
                .map_err(|error| format!("failed to fetch events at block {block_number}: {error}"))?;

            let mut matched_events = Vec::new();
            for event in events.iter() {
                let event = event
                    .map_err(|error| format!("failed to decode event at block {block_number}: {error}"))?;
                if event.pallet_name() == config.pallet_name && event.event_name() == config.event_name {
                    matched_events.push(decode_memory_registered_event(&event, block_number)?);
                }
            }

            if matched_events.is_empty() {
                continue;
            }

            let mut registry_entries = Vec::new();
            for event in &matched_events {
                let anchor = self
                    .fetch_registry_anchor_at(&config, &at_block, &event.memory_id)
                    .await?
                    .ok_or_else(|| {
                        format!(
                            "registry lookup missing memory {} in {}.{}",
                            event.memory_id, config.pallet_name, config.storage_entry_name
                        )
                    })?;
                registry_entries.push(anchor);
            }

            return Ok(SubstrateAnchorSource::from_mock_data(
                config,
                matched_events,
                registry_entries,
            ));
        }

        Err(format!(
            "no finalized block with {}.{} events found from block {} on {}",
            config.pallet_name, config.event_name, from_block, config.ws_url
        ))
    }

    async fn fetch_registry_anchor_at(
        &self,
        config: &SubstrateAnchorSourceConfig,
        at_block: &OnlineClientAtBlock<SubstrateConfig>,
        memory_id: &str,
    ) -> Result<Option<SubstrateRegistryAnchor>, String> {
        let address = dynamic::storage::<(Vec<u8>,), DynamicRegistryAnchorRecord>(
            &config.pallet_name,
            &config.storage_entry_name,
        );

        let Some(value) = at_block
            .storage()
            .try_fetch(address, (memory_id.as_bytes().to_vec(),))
            .await
            .map_err(|error| {
                format!(
                    "failed to fetch storage {}.{} for {}: {error}",
                    config.pallet_name, config.storage_entry_name, memory_id
                )
            })?
        else {
            return Ok(None);
        };

        let decoded = value.decode().map_err(|error| {
            format!(
                "failed to decode storage {}.{} for {}: {error}",
                config.pallet_name, config.storage_entry_name, memory_id
            )
        })?;

        Ok(Some(SubstrateRegistryAnchor {
            memory_id: utf8_field("anchor.memory_id", decoded.memory_id)?,
            canonical_hash_hex: utf8_field("anchor.canonical_hash_hex", decoded.canonical_hash_hex)?,
            content_cid: utf8_field("anchor.content_cid", decoded.content_cid)?,
            producer_id: utf8_field("anchor.producer_id", decoded.producer_id)?,
            policy_id: decoded
                .policy_id
                .map(|value| utf8_field("anchor.policy_id", value))
                .transpose()?,
            submitter: decoded.submitter.to_string(),
            registered_at: 0,
        }))
    }
}

impl SolanaRpcMirrorSink {
    pub fn new(config: SolanaRpcMirrorSinkConfig) -> Self {
        Self { config }
    }
}

impl MirrorSink for SolanaRpcMirrorSink {
    fn write_instruction_record(&mut self, record: &MirroredInstructionRecord) -> Result<(), String> {
        let preview = build_solana_transaction_preview(&self.config, record)?;
        let signed = build_signed_solana_transaction_preview(&self.config, &preview)?;

        if let Some(path) = &self.config.outbox_path {
            append_solana_transaction_preview(path, &preview)?;
            append_solana_signed_transaction_preview(path, &signed)?;
            if self.config.submit_rpc {
                let request = build_send_transaction_request(&self.config, &signed);
                append_solana_rpc_request_preview(path, &request)?;
            }
        }

        if self.config.submit_rpc {
            send_solana_transaction_request(&self.config, &signed)?;
            return Ok(());
        }

        if self.config.outbox_path.is_some() {
            return Ok(());
        }

        Err(format!(
            "solana rpc sink built signed transaction for {} at {} but neither outbox_path nor submit_rpc is configured",
            preview.program_id, preview.rpc_url
        ))
    }
}

pub fn load_memory(path: impl AsRef<Path>) -> Result<MemoryObject, String> {
    let path = path.as_ref();
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    serde_json::from_str(&raw).map_err(|err| format!("failed to parse memory object: {err}"))
}

pub fn build_preview_from_memory(memory: &MemoryObject) -> Result<RelayerPreview, String> {
    let anchor_payload = anchor_payload_from_memory(memory).map_err(|error| error.to_string())?;
    build_preview_from_anchor(&anchor_payload)
}

pub fn build_preview_from_anchor(anchor_payload: &AnchorPayload) -> Result<RelayerPreview, String> {
    let instruction = MemoryMirrorInstruction::from(anchor_payload.clone());
    let instruction_bytes =
        borsh::to_vec(&instruction).map_err(|error| format!("failed to encode instruction: {error}"))?;

    Ok(RelayerPreview {
        solana_instruction: instruction_preview_from_instruction(&instruction),
        anchor_payload: anchor_payload.clone(),
        instruction_bytes_hex: hex(&instruction_bytes),
    })
}

pub fn build_instruction_record_from_memory(
    memory: &MemoryObject,
) -> Result<MirroredInstructionRecord, String> {
    let anchor_payload = anchor_payload_from_memory(memory).map_err(|error| error.to_string())?;
    let envelope = AnchorEnvelope {
        source_chain: "memory-object-file".into(),
        source_cursor: memory.memory_id.clone(),
        anchor_payload,
    };
    build_instruction_record_from_envelope(&envelope)
}

pub fn build_instruction_record_from_anchor(
    anchor_payload: &AnchorPayload,
) -> Result<MirroredInstructionRecord, String> {
    let envelope = AnchorEnvelope {
        source_chain: "anchor-payload".into(),
        source_cursor: anchor_payload.memory_id.clone(),
        anchor_payload: anchor_payload.clone(),
    };
    build_instruction_record_from_envelope(&envelope)
}

pub fn build_instruction_record_from_envelope(
    envelope: &AnchorEnvelope,
) -> Result<MirroredInstructionRecord, String> {
    let preview = build_preview_from_anchor(&envelope.anchor_payload)?;
    Ok(MirroredInstructionRecord {
        memory_id: preview.anchor_payload.memory_id.clone(),
        source_chain: envelope.source_chain.clone(),
        source_cursor: envelope.source_cursor.clone(),
        anchor_payload: preview.anchor_payload,
        solana_instruction: preview.solana_instruction,
        instruction_bytes_hex: preview.instruction_bytes_hex,
    })
}

pub fn anchor_envelope_from_substrate_event(
    chain_name: &str,
    event: &SubstrateMemoryRegisteredEvent,
    anchor: &SubstrateRegistryAnchor,
) -> Result<AnchorEnvelope, String> {
    if event.memory_id != anchor.memory_id {
        return Err(format!(
            "memory id mismatch between event {} and registry {}",
            event.memory_id, anchor.memory_id
        ));
    }

    if event.canonical_hash_hex != anchor.canonical_hash_hex {
        return Err(format!(
            "canonical hash mismatch for memory {} between event and registry",
            event.memory_id
        ));
    }

    if event.submitter != anchor.submitter {
        return Err(format!(
            "submitter mismatch for memory {} between event and registry",
            event.memory_id
        ));
    }

    Ok(AnchorEnvelope {
        source_chain: chain_name.to_owned(),
        source_cursor: format!("block:{}:event:{}", event.block_number, event.event_index),
        anchor_payload: AnchorPayload {
            memory_id: anchor.memory_id.clone(),
            canonical_hash_hex: anchor.canonical_hash_hex.clone(),
            content_cid: anchor.content_cid.clone(),
            producer_id: anchor.producer_id.clone(),
            policy_id: anchor.policy_id.clone(),
        },
    })
}

fn decode_memory_registered_event(
    event: &subxt::events::Event<SubstrateConfig>,
    block_number: u64,
) -> Result<SubstrateMemoryRegisteredEvent, String> {
    let mut bytes = event.field_bytes();
    let memory_id = Vec::<u8>::decode(&mut bytes)
        .map_err(|error| format!("failed to decode event memory_id at block {block_number}: {error}"))?;
    let canonical_hash_hex = Vec::<u8>::decode(&mut bytes).map_err(|error| {
        format!("failed to decode event canonical_hash_hex at block {block_number}: {error}")
    })?;
    let submitter = format!("0x{}", hex(bytes));

    Ok(SubstrateMemoryRegisteredEvent {
        block_number,
        event_index: event.index(),
        memory_id: utf8_field("event.memory_id", memory_id)?,
        canonical_hash_hex: utf8_field("event.canonical_hash_hex", canonical_hash_hex)?,
        submitter,
    })
}

fn utf8_field(name: &'static str, value: Vec<u8>) -> Result<String, String> {
    String::from_utf8(value).map_err(|error| format!("failed to decode {name} as utf8: {error}"))
}

pub fn load_checkpoint(path: impl AsRef<Path>) -> Result<RelayCheckpoint, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(RelayCheckpoint::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|err| format!("failed to read checkpoint {}: {err}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse checkpoint {}: {err}", path.display()))
}

pub fn save_checkpoint(
    path: impl AsRef<Path>,
    checkpoint: &RelayCheckpoint,
) -> Result<(), String> {
    let path = path.as_ref();
    let raw = serde_json::to_string_pretty(checkpoint)
        .map_err(|err| format!("failed to serialize checkpoint: {err}"))?;
    fs::write(path, raw).map_err(|err| format!("failed to write checkpoint {}: {err}", path.display()))
}

pub fn append_instruction_record(
    path: impl AsRef<Path>,
    record: &MirroredInstructionRecord,
) -> Result<(), String> {
    let path = path.as_ref();
    let line = serde_json::to_string(record)
        .map_err(|err| format!("failed to serialize instruction record: {err}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|err| format!("failed to open sink {}: {err}", path.display()))?;
    writeln!(file, "{line}")
        .map_err(|err| format!("failed to append to sink {}: {err}", path.display()))
}

pub fn relay_memory_file(
    memory_path: impl AsRef<Path>,
    sink_path: impl AsRef<Path>,
    checkpoint_path: impl AsRef<Path>,
) -> Result<RelayOutcome, String> {
    let sink_path = sink_path.as_ref();
    let checkpoint_path = checkpoint_path.as_ref();
    let memory = load_memory(memory_path)?;
    let anchor_payload = anchor_payload_from_memory(&memory).map_err(|error| error.to_string())?;
    let mut sink = JsonlMirrorSink::new(sink_path.display().to_string());
    let envelope = AnchorEnvelope {
        source_chain: "memory-object-file".into(),
        source_cursor: memory.memory_id.clone(),
        anchor_payload,
    };
    relay_anchor_envelope_with_sink(&envelope, &mut sink, checkpoint_path, sink_path.display().to_string())
}

pub fn relay_anchor_payload(
    anchor_payload: &AnchorPayload,
    sink_path: impl AsRef<Path>,
    checkpoint_path: impl AsRef<Path>,
) -> Result<RelayOutcome, String> {
    let sink_path = sink_path.as_ref();
    let checkpoint_path = checkpoint_path.as_ref();
    let mut sink = JsonlMirrorSink::new(sink_path.display().to_string());
    let envelope = AnchorEnvelope {
        source_chain: "anchor-payload".into(),
        source_cursor: anchor_payload.memory_id.clone(),
        anchor_payload: anchor_payload.clone(),
    };
    relay_anchor_envelope_with_sink(&envelope, &mut sink, checkpoint_path, sink_path.display().to_string())
}

pub fn relay_anchor_source_file(
    source_path: impl AsRef<Path>,
    sink_path: impl AsRef<Path>,
    checkpoint_path: impl AsRef<Path>,
) -> Result<Vec<RelayOutcome>, String> {
    let source_path = source_path.as_ref();
    let mut source = JsonlAnchorSource::from_jsonl_path(source_path)?;
    relay_anchor_source_to_jsonl_sink(&mut source, sink_path, checkpoint_path)
}

pub fn relay_anchor_source_to_jsonl_sink(
    source: &mut dyn AnchorSource,
    sink_path: impl AsRef<Path>,
    checkpoint_path: impl AsRef<Path>,
) -> Result<Vec<RelayOutcome>, String> {
    let sink_path = sink_path.as_ref();
    let checkpoint_path = checkpoint_path.as_ref();
    let mut sink = JsonlMirrorSink::new(sink_path.display().to_string());
    let mut outcomes = Vec::new();

    while let Some(anchor_envelope) = source.next_anchor_envelope()? {
        let outcome = relay_anchor_envelope_with_sink(
            &anchor_envelope,
            &mut sink,
            checkpoint_path,
            sink_path.display().to_string(),
        )?;
        outcomes.push(outcome);
    }

    Ok(outcomes)
}

fn relay_anchor_envelope_with_sink(
    anchor_envelope: &AnchorEnvelope,
    sink: &mut dyn MirrorSink,
    checkpoint_path: &Path,
    sink_path: String,
) -> Result<RelayOutcome, String> {
    let record = build_instruction_record_from_envelope(anchor_envelope)?;
    let mut checkpoint = load_checkpoint(checkpoint_path)?;

    if checkpoint.mirrored_memory_ids.contains(&record.memory_id) {
        return Ok(RelayOutcome {
            memory_id: record.memory_id,
            skipped: true,
            sink_path,
            checkpoint_path: checkpoint_path.display().to_string(),
        });
    }

    sink.write_instruction_record(&record)?;
    checkpoint
        .mirrored_memory_ids
        .insert(record.memory_id.clone());
    save_checkpoint(checkpoint_path, &checkpoint)?;

    Ok(RelayOutcome {
        memory_id: record.memory_id,
        skipped: false,
        sink_path,
        checkpoint_path: checkpoint_path.display().to_string(),
    })
}

pub fn build_solana_transaction_preview(
    config: &SolanaRpcMirrorSinkConfig,
    record: &MirroredInstructionRecord,
) -> Result<SolanaMirrorTransactionPreview, String> {
    let program_id = parse_pubkey("program_id", &config.program_id)?;
    let authority_pubkey = parse_pubkey("authority_pubkey", &config.authority_pubkey)?;
    let mirror_account_pubkey = parse_pubkey("mirror_account_pubkey", &config.mirror_account_pubkey)?;
    let instruction = MemoryMirrorInstruction::from(record.anchor_payload.clone());
    let instruction_data = borsh::to_vec(&instruction)
        .map_err(|error| format!("failed to encode Solana instruction: {error}"))?;

    let accounts = vec![
        AccountMeta::new(mirror_account_pubkey, false),
        AccountMeta::new_readonly(authority_pubkey, true),
    ];

    Ok(SolanaMirrorTransactionPreview {
        rpc_url: config.rpc_url.clone(),
        program_id: program_id.to_string(),
        authority_pubkey: authority_pubkey.to_string(),
        mirror_account_pubkey: mirror_account_pubkey.to_string(),
        instruction_name: record.solana_instruction.kind.clone(),
        accounts: accounts
            .into_iter()
            .map(|meta| SolanaAccountMetaPreview {
                pubkey: meta.pubkey.to_string(),
                is_signer: meta.is_signer,
                is_writable: meta.is_writable,
            })
            .collect(),
        instruction_data_hex: hex(&instruction_data),
    })
}

pub fn append_solana_transaction_preview(
    path: impl AsRef<Path>,
    preview: &SolanaMirrorTransactionPreview,
) -> Result<(), String> {
    let path = path.as_ref();
    let line = serde_json::to_string(preview)
        .map_err(|error| format!("failed to serialize Solana transaction preview: {error}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open Solana outbox {}: {error}", path.display()))?;
    writeln!(file, "{line}")
        .map_err(|error| format!("failed to append Solana outbox {}: {error}", path.display()))
}

pub fn build_signed_solana_transaction_preview(
    config: &SolanaRpcMirrorSinkConfig,
    preview: &SolanaMirrorTransactionPreview,
) -> Result<SolanaSignedTransactionPreview, String> {
    let keypair = read_solana_keypair(&config.authority_keypair_path)?;
    let recent_blockhash = resolve_recent_blockhash(config)?;
    let program_id = parse_pubkey("program_id", &preview.program_id)?;
    let authority_pubkey = parse_pubkey("authority_pubkey", &preview.authority_pubkey)?;
    let mirror_account_pubkey =
        parse_pubkey("mirror_account_pubkey", &preview.mirror_account_pubkey)?;

    if authority_pubkey != keypair.pubkey() {
        return Err(format!(
            "authority_pubkey {} does not match keypair pubkey {}",
            authority_pubkey,
            keypair.pubkey()
        ));
    }

    let instruction_data = decode_hex(&preview.instruction_data_hex)?;
    let instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(mirror_account_pubkey, false),
            AccountMeta::new_readonly(authority_pubkey, true),
        ],
        data: instruction_data,
    };

    let message = Message::new(&[instruction], Some(&authority_pubkey));
    let mut transaction = Transaction::new_unsigned(message);
    transaction
        .try_sign(&[&keypair], recent_blockhash)
        .map_err(|error| format!("failed to sign Solana transaction: {error}"))?;

    let bytes = bincode::serialize(&transaction)
        .map_err(|error| format!("failed to serialize Solana transaction: {error}"))?;

    Ok(SolanaSignedTransactionPreview {
        rpc_url: config.rpc_url.clone(),
        signer_pubkey: authority_pubkey.to_string(),
        recent_blockhash: recent_blockhash.to_string(),
        transaction_base64: BASE64_STANDARD.encode(bytes),
    })
}

pub fn append_solana_signed_transaction_preview(
    path: impl AsRef<Path>,
    preview: &SolanaSignedTransactionPreview,
) -> Result<(), String> {
    let path = path.as_ref();
    let line = serde_json::to_string(preview)
        .map_err(|error| format!("failed to serialize Solana signed transaction preview: {error}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open Solana outbox {}: {error}", path.display()))?;
    writeln!(file, "{line}")
        .map_err(|error| format!("failed to append Solana outbox {}: {error}", path.display()))
}

pub fn build_send_transaction_request(
    config: &SolanaRpcMirrorSinkConfig,
    signed: &SolanaSignedTransactionPreview,
) -> SolanaRpcRequestPreview {
    SolanaRpcRequestPreview {
        rpc_url: config.rpc_url.clone(),
        method: "sendTransaction".into(),
        params: serde_json::json!([
            signed.transaction_base64,
            {
                "encoding": "base64",
                "skipPreflight": false,
                "preflightCommitment": "confirmed"
            }
        ]),
    }
}

pub fn append_solana_rpc_request_preview(
    path: impl AsRef<Path>,
    preview: &SolanaRpcRequestPreview,
) -> Result<(), String> {
    let path = path.as_ref();
    let line = serde_json::to_string(preview)
        .map_err(|error| format!("failed to serialize Solana RPC request preview: {error}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open Solana outbox {}: {error}", path.display()))?;
    writeln!(file, "{line}")
        .map_err(|error| format!("failed to append Solana outbox {}: {error}", path.display()))
}

fn instruction_preview_from_instruction(
    instruction: &MemoryMirrorInstruction,
) -> SolanaInstructionPreview {
    match instruction {
        MemoryMirrorInstruction::UpsertMemory {
            memory_id,
            canonical_hash_hex,
            content_cid,
            producer_id,
            policy_id,
        } => SolanaInstructionPreview {
            kind: "UpsertMemory".into(),
            memory_id: memory_id.clone(),
            canonical_hash_hex: canonical_hash_hex.clone(),
            content_cid: content_cid.clone(),
            producer_id: producer_id.clone(),
            policy_id: policy_id.clone(),
        },
        MemoryMirrorInstruction::SetConsumptionStatus { memory_id, .. } => {
            SolanaInstructionPreview {
                kind: "SetConsumptionStatus".into(),
                memory_id: memory_id.clone(),
                canonical_hash_hex: String::new(),
                content_cid: String::new(),
                producer_id: String::new(),
                policy_id: None,
            }
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn parse_pubkey(name: &'static str, value: &str) -> Result<Pubkey, String> {
    Pubkey::from_str(value).map_err(|error| format!("invalid {name} {value}: {error}"))
}

fn read_solana_keypair(path: &str) -> Result<Keypair, String> {
    let raw = fs::read_to_string(path).map_err(|error| format!("failed to read keypair {path}: {error}"))?;
    let bytes: Vec<u8> =
        serde_json::from_str(&raw).map_err(|error| format!("failed to parse keypair {path}: {error}"))?;
    Keypair::try_from(bytes.as_slice())
        .map_err(|error| format!("invalid keypair bytes in {path}: {error}"))
}

fn resolve_recent_blockhash(config: &SolanaRpcMirrorSinkConfig) -> Result<Hash, String> {
    if let Some(value) = &config.recent_blockhash_override {
        return Hash::from_str(value)
            .map_err(|error| format!("invalid recent_blockhash_override {value}: {error}"));
    }

    let client = HttpClient::new();
    let response: serde_json::Value = client
        .post(&config.rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getLatestBlockhash",
            "params": [{ "commitment": "confirmed" }]
        }))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("failed to fetch latest blockhash from {}: {error}", config.rpc_url))?
        .json()
        .map_err(|error| format!("failed to decode latest blockhash response: {error}"))?;

    let blockhash = response
        .get("result")
        .and_then(|value| value.get("value"))
        .and_then(|value| value.get("blockhash"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("missing blockhash in Solana RPC response from {}", config.rpc_url))?;

    Hash::from_str(blockhash)
        .map_err(|error| format!("invalid blockhash returned by Solana RPC {blockhash}: {error}"))
}

fn send_solana_transaction_request(
    config: &SolanaRpcMirrorSinkConfig,
    signed: &SolanaSignedTransactionPreview,
) -> Result<(), String> {
    let request = build_send_transaction_request(config, signed);
    let client = HttpClient::new();
    let response: serde_json::Value = client
        .post(&request.rpc_url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": request.method,
            "params": request.params
        }))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("failed to send Solana transaction to {}: {error}", request.rpc_url))?
        .json()
        .map_err(|error| format!("failed to decode sendTransaction response: {error}"))?;

    if response.get("error").is_some() {
        return Err(format!("solana sendTransaction returned error: {}", response));
    }

    Ok(())
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err(format!("invalid hex length {}", value.len()));
    }

    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|error| format!("invalid hex at byte {}: {error}", index / 2))
        })
        .collect()
}
