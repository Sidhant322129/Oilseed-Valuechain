// src/components/ProvenanceTimelineModal.jsx
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, ExternalLink, QrCode, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { apiGet } from '@/services/api';
import LoadingSpinner from '@/components/feedback/LoadingSpinner';

export default function ProvenanceTimelineModal({ batchId, batchCode, isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const targetId = batchCode || batchId;

    if (!targetId) {
      setError('No batch identifier provided.');
      setLoading(false);
      return;
    }

    apiGet(`/blockchain/provenance/${targetId}`)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[ProvenanceModal] Failed to fetch provenance records:', err);
          setError(err.message || 'Failed to load verified on-chain provenance records.');
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, batchId, batchCode]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(13, 17, 23, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '750px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D8E3D9',
          borderRadius: '12px',
          padding: '1.75rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <ShieldCheck size={22} color="#4F7A5B" />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', color: '#174A36', margin: 0 }}>
                Blockchain Provenance & Traceability
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#174A36', fontWeight: 600 }}>
                {data?.batch_code || batchCode || batchId}
              </span>
              <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#E8F1EA', color: '#4F7A5B', border: '1px solid #D8E3D9', fontWeight: 600 }}>
                Sepolia Verified
              </span>
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
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <LoadingSpinner message="Querying Sepolia on-chain records..." />
          </div>
        ) : error ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              padding: '0.75rem',
              borderRadius: '50%',
              background: '#DA363322',
              color: '#DA3633',
              marginBottom: '1rem',
              border: '1px solid #DA363344'
            }}>
              <AlertCircle size={28} />
            </div>
            <h3 style={{ color: '#174A36', fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
              Provenance Records Unavailable
            </h3>
            <p style={{ color: '#4F7A5B', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
              {error}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1.25rem', fontSize: '0.82rem' }}
            >
              Close
            </button>
          </div>
        ) : !data || !data.provenance_trail || data.provenance_trail.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              padding: '0.75rem',
              borderRadius: '50%',
              background: '#D8E3D944',
              color: '#4F7A5B',
              marginBottom: '1rem',
              border: '1px solid #D8E3D9'
            }}>
              <Clock size={28} />
            </div>
            <h3 style={{ color: '#174A36', fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
              No Provenance Records Found
            </h3>
            <p style={{ color: '#4F7A5B', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
              No on-chain batch history has been recorded for this identifier yet.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1.25rem', fontSize: '0.82rem' }}
            >
              Close
            </button>
          </div>
        ) : (
          <div>
            {/* Overview Metadata Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
                background: '#FFFFFF',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                border: '1px solid #F3F7F3',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.68rem', color: '#4F7A5B' }}>Crop & Variety</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#174A36' }}>
                  {data?.crop_type || '—'} {data?.variety ? `(${data.variety})` : ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#4F7A5B' }}>Origin District</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#174A36' }}>
                  {data?.origin || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#4F7A5B' }}>Farmer Identity</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#174A36' }}>
                  {data?.farmer_name || 'Verified Farmer'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#4F7A5B' }}>Network</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#58a6ff' }}>
                  {data?.network || 'Sepolia (11155111)'}
                </div>
              </div>
            </div>

            {/* Timeline Trail */}
            <div style={{ position: 'relative', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '7px',
                  top: '10px',
                  bottom: '10px',
                  width: '2px',
                  background: '#D8E3D9',
                }}
              />

              {data?.provenance_trail?.map((step, idx) => {
                const isUpcoming = step.status === 'upcoming' || step.chain_status === 'upcoming' || (!step.tx_hash && idx === 3 && step.status !== 'settled');
                const isPending = !isUpcoming && (step.chain_status === 'pending' || step.status === 'pending');
                const isConfirmed = !isUpcoming && !isPending && (step.status === 'verified' || step.status === 'settled' || step.chain_status === 'confirmed' || !!step.tx_hash);

                return (
                  <div key={idx} style={{ position: 'relative', marginBottom: '1.25rem', opacity: isUpcoming ? 0.75 : 1 }}>
                    {/* Stage Timeline Node */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-1.5rem',
                        top: '2px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: isConfirmed ? '#E8F1EA' : isPending ? '#382b0e' : '#FFFFFF',
                        border: isConfirmed ? '2px solid #4F7A5B' : isPending ? '2px solid #174A36' : '2px dashed #D8E3D9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isConfirmed ? (
                        <CheckCircle2 size={12} color="#4F7A5B" />
                      ) : (
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: isPending ? '#174A36' : '#4F7A5B',
                          }}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        background: '#FFFFFF',
                        border: isUpcoming ? '1px dashed #D8E3D9' : '1px solid #D8E3D9',
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isUpcoming ? '#4F7A5B' : '#174A36', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {step.stage}
                          {isUpcoming ? (
                            <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: '#FFFFFF', color: '#4F7A5B', border: '1px dashed #D8E3D9', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 500 }}>
                              <Clock size={10} /> Upcoming Stage
                            </span>
                          ) : isPending ? (
                            <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: '#382b0e', color: '#174A36', border: '1px solid #D8E3D9', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                              <Clock size={10} /> Pending Confirmation
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: '#E8F1EA', color: '#4F7A5B', border: '1px solid #D8E3D9', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                              <CheckCircle2 size={10} /> Verified On-Chain
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#4F7A5B', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {step.timestamp ? (
                            <>
                              <Clock size={12} /> {new Date(step.timestamp).toLocaleDateString('en-GB')}
                            </>
                          ) : isConfirmed || step.tx_hash ? (
                            <>
                              <Clock size={12} /> {new Date().toLocaleDateString('en-GB')}
                            </>
                          ) : (
                            <span style={{ color: '#4F7A5B', fontStyle: 'italic' }}>Pending Milestone</span>
                          )}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.74rem', color: '#4F7A5B', marginBottom: '0.5rem' }}>
                        Actor: <span style={{ color: isUpcoming ? '#4F7A5B' : '#174A36', fontWeight: 500 }}>{step.actor}</span> · Contract: <span style={{ color: isUpcoming ? '#4F7A5B' : '#174A36', fontFamily: 'var(--font-mono)' }}>{step.contract}</span>
                      </div>

                      <div style={{ fontSize: '0.76rem', color: isUpcoming ? '#4F7A5B' : '#174A36', lineHeight: 1.4, marginBottom: '0.6rem' }}>
                        {step.details}
                      </div>

                      {step.ipfs_cid && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <FileText size={14} color="#58a6ff" />
                          <span style={{ fontSize: '0.72rem', color: '#4F7A5B' }}>IPFS CID:</span>
                          <a
                            href={step.gateway_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#58a6ff', textDecoration: 'none' }}
                          >
                            {step.ipfs_cid.slice(0, 18)}... ↗
                          </a>
                        </div>
                      )}

                      {/* Footer: Tx Hash or Upcoming Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem', borderTop: isUpcoming ? '1px dashed #F3F7F3' : '1px solid #F3F7F3' }}>
                        {isUpcoming ? (
                          <span style={{ fontSize: '0.68rem', color: '#4F7A5B', fontStyle: 'italic' }}>
                            On-chain smart contract trigger scheduled for subsequent value-chain milestone
                          </span>
                        ) : step.tx_hash ? (
                          <>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#4F7A5B' }}>
                              Tx: {step.tx_hash.slice(0, 14)}...
                            </span>
                            {step.explorer_url && (
                              <a
                                href={step.explorer_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#58a6ff',
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                  fontWeight: 600,
                                }}
                              >
                                Etherscan <ExternalLink size={11} />
                              </a>
                            )}
                          </>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#174A36' }}>
                            Tx: Awaiting Sepolia mining confirmation
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Verification QR Code Section */}
            {(() => {
              const confirmedStep = data?.provenance_trail?.find(s => s.tx_hash && s.explorer_url);
              const qrTargetUrl = confirmedStep?.explorer_url || 
                `https://sepolia.etherscan.io/address/0x364873607Ae44E56f9f8b1Bc460C87B8fa530ec7`;
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data=${encodeURIComponent(qrTargetUrl)}`;

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: '#FFFFFF',
                    borderRadius: '8px',
                    border: '1px solid #D8E3D9',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: '#fff', padding: '4px', borderRadius: '8px', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      <img
                        src={qrImageUrl}
                        alt="Tamper-Proof QR Provenance"
                        style={{ width: '64px', height: '64px', display: 'block', borderRadius: '4px' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#174A36', marginBottom: '0.2rem' }}>
                        Tamper-Proof QR Provenance Badge
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#4F7A5B', lineHeight: 1.4 }}>
                        Scan with your phone camera to open verified on-chain provenance directly on Sepolia Etherscan.
                      </div>
                      <a
                        href={qrTargetUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.7rem', color: '#58a6ff', textDecoration: 'none', marginTop: '0.25rem', display: 'inline-block' }}
                      >
                        Target: {qrTargetUrl.slice(0, 45)}... ↗
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(qrTargetUrl);
                      alert(`Provenance verification URL copied:\n${qrTargetUrl}`);
                    }}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #D8E3D9',
                      color: '#174A36',
                      borderRadius: '6px',
                      padding: '0.5rem 0.9rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Copy Public Link
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

