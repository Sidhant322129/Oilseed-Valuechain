// src/components/LabQualityCertificationModal.jsx
// Production-grade Lab Quality Assay & Blockchain Certification Modal
// Anchors chemical assay reports to IPFS Pinata and records CIDs in QualityOracle.sol on Ethereum Sepolia.
// Conforms strictly to the Sovereign Harvest design system.

import React, { useState } from 'react';
import {
  X, ShieldCheck, Upload, FileText, CheckCircle2, AlertCircle,
  ExternalLink, Loader2, Award, Droplets, Flame, Sparkles
} from 'lucide-react';
import { apiPost } from '@/services/api';

const GRADE_OPTIONS = [
  { value: 'grade_a_premium', label: 'Grade A — Premium Quality (Moisture < 8%, High Oil)', color: '#4F7A5B' },
  { value: 'grade_b_standard', label: 'Grade B — Standard Commercial Grade', color: '#388bfd' },
  { value: 'grade_c_fair', label: 'Grade C — Fair Average Quality (FAQ)', color: '#174A36' },
  { value: 'rejected', label: 'Rejected — Exceeds Moisture / Foreign Matter Limits', color: '#DA3633' },
];

export default function LabQualityCertificationModal({
  batch,
  isOpen,
  onClose,
  onSuccess,
  onOpenProvenance,
}) {
  const [moisturePct, setMoisturePct] = useState(batch?.moisture_pct || 6.8);
  const [oilContentPct, setOilContentPct] = useState(batch?.oil_content_pct || 48.2);
  const [foreignMatterPct, setForeignMatterPct] = useState(batch?.foreign_matter_pct || 0.5);
  const [qualityGrade, setQualityGrade] = useState(batch?.quality_grade || 'grade_a_premium');
  const [labName, setLabName] = useState('NABL Certified Central Oilseed Laboratory, Indore');
  const [certificateDoc, setCertificateDoc] = useState(`NABL-ASSAY-CERT-${batch?.batch_code || Date.now()}.pdf`);

  const [loading, setLoading] = useState(false);
  const [stepStatus, setStepStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [certResult, setCertResult] = useState(null);

  if (!isOpen || !batch) return null;

  const batchCode = batch.batch_code || `BATCH-${batch.id?.slice(0, 8)}`;
  const cropType = batch.crops?.crop_type || 'Oilseed';
  const variety = batch.crops?.variety || 'Commercial Variety';
  const farmerName = batch.farmers?.users?.full_name || 'Verified Farmer';

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setCertResult(null);

    try {
      setStepStatus('Step 1/3: Pinning assay metrics and certificate payload to IPFS Pinata...');

      const payload = {
        batch_id: batchCode,
        quality_grade: qualityGrade,
        moisture_pct: parseFloat(moisturePct),
        oil_content_pct: parseFloat(oilContentPct),
        foreign_matter_pct: parseFloat(foreignMatterPct),
        cert_type: 'nabl_oilseed_assay',
        document_url: certificateDoc || `https://ipfs.oilseed.io/docs/${batchCode}.pdf`,
        lab_data: {
          laboratory: labName,
          moisture_pct: parseFloat(moisturePct),
          oil_content_pct: parseFloat(oilContentPct),
          foreign_matter_pct: parseFloat(foreignMatterPct),
          quality_grade: qualityGrade,
          certified_at: new Date().toISOString()
        }
      };

      setStepStatus('Step 2/3: Broadcasting transaction to QualityOracle.sol on Ethereum Sepolia...');
      
      const response = await apiPost('/blockchain/pin-certificate', payload);

      if (!response.success && !response.ipfs_cid) {
        throw new Error(response.error?.message || 'Failed to notarize lab certificate on-chain.');
      }

      setStepStatus('Step 3/3: Block confirmed! Generating cryptographic provenance receipt...');
      setCertResult(response);

      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err) {
      console.error('[LabQualityCertificationModal] Error:', err);
      setErrorMsg(err.message || 'An error occurred during lab certification.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#FFFFFF',
          border: '1px solid #D8E3D9',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          color: '#174A36',
          fontFamily: 'var(--font-body)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #D8E3D9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#E8F1EA',
                border: '1px solid #D8E3D9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Award size={20} color="#4F7A5B" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', color: '#fff', letterSpacing: '-0.02em' }}>
                Stage 3: Lab Quality Certification
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#4F7A5B' }}>
                Anchor laboratory assay results to IPFS Pinata & notarize on QualityOracle.sol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4F7A5B',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          {/* Target Batch Summary Pill */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#FFFFFF',
              border: '1px solid #F3F7F3',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.7rem', color: '#4F7A5B' }}>Target Oilseed Batch</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#174A36', fontWeight: 700 }}>
                {batchCode}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#174A36', marginTop: '2px' }}>
                {cropType} ({variety}) · <strong>{batch.quantity_kg || 0} kg</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#4F7A5B' }}>Origin Farmer</div>
              <div style={{ fontSize: '0.8rem', color: '#174A36', fontWeight: 600 }}>{farmerName}</div>
              <span
                style={{
                  fontSize: '0.62rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: '#E8F1EA',
                  color: '#4F7A5B',
                  border: '1px solid #D8E3D9',
                  display: 'inline-block',
                  marginTop: '4px',
                  fontWeight: 600,
                }}
              >
                Stage 2 Verified On-Chain
              </span>
            </div>
          </div>

          {/* Success Banner */}
          {certResult ? (
            <div
              style={{
                background: '#E8F1EA',
                border: '1px solid #4F7A5B',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <CheckCircle2 size={20} color="#4F7A5B" />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4F7A5B' }}>
                  Lab Assay Certified & Notarized on Ethereum Sepolia!
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#174A36', margin: '0 0 1rem', lineHeight: 1.5 }}>
                The chemical assay and NABL certificate have been pinned to IPFS Pinata and the content identifier
                (CID) has been permanently inscribed in the <strong>QualityOracle.sol</strong> contract on Sepolia.
              </p>

              <div style={{ background: '#FFFFFF', borderRadius: '6px', padding: '0.85rem', marginBottom: '1rem', border: '1px solid #F3F7F3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#4F7A5B' }}>Pinata IPFS CID:</span>
                  <a
                    href={certResult.gateway_url || `https://gateway.pinata.cloud/ipfs/${certResult.ipfs_cid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    {certResult.ipfs_cid} <ExternalLink size={12} />
                  </a>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#4F7A5B' }}>Sepolia Tx Hash:</span>
                  <a
                    href={certResult.explorer_url || `https://sepolia.etherscan.io/tx/${certResult.tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#4F7A5B', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    {certResult.tx_hash?.slice(0, 16)}...{certResult.tx_hash?.slice(-8)} <ExternalLink size={12} />
                  </a>
                </div>
                {certResult.block_number && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#4F7A5B' }}>Mined Block Number:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#174A36', fontWeight: 600 }}>
                      #{certResult.block_number}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenProvenance) onOpenProvenance(batchCode);
                  }}
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '0.82rem',
                    padding: '0.6rem 1rem',
                  }}
                >
                  <Sparkles size={16} /> View Provenance Timeline Modal
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.6rem 1.25rem' }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {errorMsg && (
                <div
                  style={{
                    background: '#DA363322',
                    border: '1px solid #DA3633',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    fontSize: '0.78rem',
                    color: '#ff7b72',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={16} color="#DA3633" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Chemical Assay Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.35rem' }}>
                    <Droplets size={14} color="#388bfd" /> Moisture Content (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="3.0"
                    max="20.0"
                    required
                    value={moisturePct}
                    onChange={e => setMoisturePct(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#FFFFFF',
                      border: '1px solid #D8E3D9',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#4F7A5B', marginTop: '2px', display: 'block' }}>
                    Target: &lt; 8.0% for storage stability
                  </span>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.35rem' }}>
                    <Flame size={14} color="#174A36" /> Oil Content (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="20.0"
                    max="65.0"
                    required
                    value={oilContentPct}
                    onChange={e => setOilContentPct(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#FFFFFF',
                      border: '1px solid #D8E3D9',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#4F7A5B', marginTop: '2px', display: 'block' }}>
                    High yield premium: &gt; 42.0%
                  </span>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.35rem' }}>
                    <ShieldCheck size={14} color="#4F7A5B" /> Foreign Matter (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.0"
                    max="10.0"
                    value={foreignMatterPct}
                    onChange={e => setForeignMatterPct(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#FFFFFF',
                      border: '1px solid #D8E3D9',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#4F7A5B', marginTop: '2px', display: 'block' }}>
                    Tolerance threshold: &lt; 1.5%
                  </span>
                </div>
              </div>

              {/* Quality Grade Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.4rem' }}>
                  Assigned Quality Grade *
                </label>
                <select
                  value={qualityGrade}
                  onChange={e => setQualityGrade(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: '1px solid #D8E3D9',
                    borderRadius: '6px',
                    color: '#fff',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                >
                  {GRADE_OPTIONS.map(g => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lab & Certificate Metadata */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.4rem' }}>
                  Accredited Testing Facility / Assayer Name
                </label>
                <input
                  type="text"
                  required
                  value={labName}
                  onChange={e => setLabName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: '1px solid #D8E3D9',
                    borderRadius: '6px',
                    color: '#fff',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#4F7A5B', marginBottom: '0.4rem' }}>
                  Lab Assay Certificate Document (PDF / Image)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div
                    style={{
                      flex: 1,
                      background: '#FFFFFF',
                      border: '1px dashed #D8E3D9',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <FileText size={16} color="#58a6ff" />
                    <input
                      type="text"
                      value={certificateDoc}
                      onChange={e => setCertificateDoc(e.target.value)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#174A36',
                        fontSize: '0.82rem',
                        fontFamily: 'var(--font-mono)',
                        width: '100%',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#4F7A5B', marginTop: '4px', display: 'block' }}>
                  This document payload will be permanently pinned to IPFS Pinata with cryptographic content hash.
                </span>
              </div>

              {/* Progress Feedback during Mining */}
              {loading && (
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #D8E3D9',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <Loader2 size={22} className="animate-spin" color="#174A36" />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#174A36' }}>
                      Blockchain Relayer Active
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#4F7A5B', marginTop: '2px' }}>
                      {stepStatus}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  borderTop: '1px solid #F3F7F3',
                  paddingTop: '1.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.55rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.82rem',
                    padding: '0.55rem 1.25rem',
                    background: 'linear-gradient(135deg, #174A36 0%, #d4952b 100%)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Mining Sepolia Block…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} /> Certify & Anchor (Sepolia + IPFS)
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

