import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  UserRound,
  Link2,
  History,
  FileDown,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Loader2,
  Check,
  Search,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  downloadImportTemplate,
  uploadImportFile,
  confirmImport,
  getImportStatus,
  downloadImportErrors,
  getImportHistory,
  exportBulkData,
} from '../lib/api';
import type { ImportType, ImportPreview, ImportProgress, ImportHistoryItem } from '../types';

export function BulkImportPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active top-level tab: 'import' | 'history' | 'export'
  const activeTab = searchParams.get('tab') || 'import';
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Wizard state: 1: Upload, 2: Validate, 3: Preview, 4: Confirm, 5: Progress, 6: Complete
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [selectedType, setSelectedType] = useState<ImportType>('MENTORS');

  // File upload state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview & Job state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreview | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  // Confirmation settings
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update' | 'ask'>('skip');
  const [reassignMentees, setReassignMentees] = useState(true);

  // Progress state
  const [progressData, setProgressData] = useState<ImportProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState<ImportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<ImportHistoryItem | null>(null);

  // Export state
  const [exportCategory, setExportCategory] = useState<'mentors' | 'mentees' | 'assignments' | 'calls' | 'performance'>('mentors');
  const [exportStatusFilter, setExportStatusFilter] = useState('All');
  const [exportStandardFilter, setExportStandardFilter] = useState('All');
  const [exportDateFilter, setExportDateFilter] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Load history when tab is clicked
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await getImportHistory();
      setHistoryItems(res.history || []);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Poll status when in progress step
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isProcessing && currentJobId) {
      interval = setInterval(async () => {
        try {
          const status = await getImportStatus(currentJobId);
          setProgressData(status);

          if (status.status === 'COMPLETED' || status.status === 'FAILED') {
            setIsProcessing(false);
            setWizardStep(6);
          }
        } catch (err) {
          console.error('Error polling status:', err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, currentJobId]);

  // Handle template download
  const handleDownloadTemplate = async (type: ImportType) => {
    try {
      const typeKey = type.toLowerCase() as 'mentors' | 'mentees' | 'assignments';
      const blob = await downloadImportTemplate(typeKey);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${typeKey}_template.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to download template');
    }
  };

  // Handle file selection and validation
  const validateAndSetFile = (file: File) => {
    setUploadError(null);

    // Reject non-CSV
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      setUploadError(`Invalid file format. Only .csv files are supported (received: ${file.name.split('.').pop() || 'unknown'}).`);
      setSelectedFile(null);
      return;
    }

    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Maximum allowed file size is 10 MB.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Upload and parse CSV -> Step 3: Preview
  const handleUploadAndValidate = async () => {
    if (!selectedFile) return;

    try {
      setIsValidating(true);
      setWizardStep(2);
      const typeKey = selectedType.toLowerCase() as 'mentors' | 'mentees' | 'assignments';
      const res = await uploadImportFile(typeKey, selectedFile);
      setCurrentJobId(res.importJobId);
      setPreviewData(res.preview);
      setWizardStep(3);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload and validate CSV.');
      setWizardStep(1);
    } finally {
      setIsValidating(false);
    }
  };

  // Confirm import -> Step 5: Progress
  const handleStartImport = async () => {
    if (!currentJobId) return;

    try {
      setIsProcessing(true);
      setWizardStep(5);
      await confirmImport(currentJobId, duplicateAction, reassignMentees);
    } catch (err: any) {
      alert(err.message || 'Failed to initiate import.');
      setIsProcessing(false);
      setWizardStep(4);
    }
  };

  // Download error report CSV
  const handleDownloadErrors = async (jobId?: string) => {
    const id = jobId || currentJobId;
    if (!id) return;

    try {
      const blob = await downloadImportErrors(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_errors_${id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to download error CSV.');
    }
  };

  // Reset wizard
  const handleReset = () => {
    setWizardStep(1);
    setSelectedFile(null);
    setUploadError(null);
    setCurrentJobId(null);
    setPreviewData(null);
    setProgressData(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Bulk Data Export
  const handleExportData = async () => {
    try {
      setIsExporting(true);
      const filters: Record<string, string> = {};
      if (exportStatusFilter !== 'All') filters.status = exportStatusFilter;
      if (exportStandardFilter !== 'All') filters.standard = exportStandardFilter;
      if (exportDateFilter) filters.date = exportDateFilter;

      const blob = await exportBulkData(exportCategory, filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportCategory}_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to export data.');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter preview rows
  const filteredRows = (previewData?.previewRows || []).filter((row) => {
    if (previewFilter !== 'all' && row.status !== previewFilter) return false;
    if (previewSearch.trim()) {
      const search = previewSearch.toLowerCase();
      const stringified = JSON.stringify(row.data).toLowerCase();
      return stringified.includes(search) || (row.message || '').toLowerCase().includes(search);
    }
    return true;
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', minWidth: 0 }}>
      {/* Top Header */}
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.75rem)', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <UploadCloud size={28} color="var(--primary)" style={{ flexShrink: 0 }} /> Bulk Import System
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Add or update mentors, mentees, and assignments efficiently using standardized CSV files.
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--surface)', padding: 4, borderRadius: 12, border: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%', boxSizing: 'border-box' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '8px 16px', fontSize: '0.88rem', borderRadius: 8, whiteSpace: 'nowrap', minHeight: 42 }}
            onClick={() => setActiveTab('import')}
          >
            <UploadCloud size={16} style={{ marginRight: 6 }} /> Bulk Import
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '8px 16px', fontSize: '0.88rem', borderRadius: 8, whiteSpace: 'nowrap', minHeight: 42 }}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} style={{ marginRight: 6 }} /> Import History
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '8px 16px', fontSize: '0.88rem', borderRadius: 8, whiteSpace: 'nowrap', minHeight: 42 }}
            onClick={() => setActiveTab('export')}
          >
            <FileDown size={16} style={{ marginRight: 6 }} /> Export Data
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: BULK IMPORT WIZARD
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div>
          {/* Quick Choice Cards (shown on Step 1) */}
          {wizardStep === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, marginBottom: 28 }}>
              {/* Card 1: Mentors */}
              <div
                style={{
                  background: selectedType === 'MENTORS' ? 'rgba(143,63,102,0.04)' : '#fff',
                  border: `2px solid ${selectedType === 'MENTORS' ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '20px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: 'var(--shadow-soft)',
                }}
                onClick={() => setSelectedType('MENTORS')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
                    <Users size={24} />
                  </div>
                  {selectedType === 'MENTORS' && (
                    <span style={{ background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                      Selected
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>Import Mentors</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
                  Upload a CSV file containing mentor name, email, phone, gender, and status.
                </p>
                <button
                  type="button"
                  className={selectedType === 'MENTORS' ? 'btn-primary' : 'btn-secondary'}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  Import Mentors
                </button>
              </div>

              {/* Card 2: Mentees */}
              <div
                style={{
                  background: selectedType === 'MENTEES' ? 'rgba(143,63,102,0.04)' : '#fff',
                  border: `2px solid ${selectedType === 'MENTEES' ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '20px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: 'var(--shadow-soft)',
                }}
                onClick={() => setSelectedType('MENTEES')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(43,138,91,0.12)', display: 'grid', placeItems: 'center', color: 'var(--success)' }}>
                    <UserRound size={24} />
                  </div>
                  {selectedType === 'MENTEES' && (
                    <span style={{ background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                      Selected
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>Import Mentees</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
                  Upload a CSV file containing student names, standards, emails, phones, and status.
                </p>
                <button
                  type="button"
                  className={selectedType === 'MENTEES' ? 'btn-primary' : 'btn-secondary'}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  Import Mentees
                </button>
              </div>

              {/* Card 3: Assignments */}
              <div
                style={{
                  background: selectedType === 'ASSIGNMENTS' ? 'rgba(143,63,102,0.04)' : '#fff',
                  border: `2px solid ${selectedType === 'ASSIGNMENTS' ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '20px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: 'var(--shadow-soft)',
                }}
                onClick={() => setSelectedType('ASSIGNMENTS')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(93,126,184,0.12)', display: 'grid', placeItems: 'center', color: 'var(--info)' }}>
                    <Link2 size={24} />
                  </div>
                  {selectedType === 'ASSIGNMENTS' && (
                    <span style={{ background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                      Selected
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>Import Assignments</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
                  Upload a CSV file pairing mentors with mentees via email matching.
                </p>
                <button
                  type="button"
                  className={selectedType === 'ASSIGNMENTS' ? 'btn-primary' : 'btn-secondary'}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  Import Assignments
                </button>
              </div>
            </div>
          )}

          {/* 6-Step Wizard Navigation Indicator */}
          <div
            className="bulk-stepper-bar"
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {[
              { num: 1, label: 'Upload' },
              { num: 2, label: 'Validate' },
              { num: 3, label: 'Preview' },
              { num: 4, label: 'Confirm' },
              { num: 5, label: 'Import' },
              { num: 6, label: 'Complete' },
            ].map((step, idx) => {
              const isActive = wizardStep === step.num;
              const isPast = wizardStep > step.num;
              return (
                <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isActive || isPast ? 1 : 0.5 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: isActive ? 'var(--primary)' : isPast ? 'var(--success)' : 'var(--surface-muted)',
                      color: isActive || isPast ? '#fff' : 'var(--text-secondary)',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                    }}
                  >
                    {isPast ? <Check size={16} /> : `0${step.num}`}
                  </div>
                  <span style={{ fontWeight: isActive ? 700 : 500, fontSize: '0.88rem', color: isActive ? 'var(--primary)' : 'inherit' }}>
                    {step.label}
                  </span>
                  {idx < 5 && <div style={{ width: 24, height: 2, background: isPast ? 'var(--success)' : 'var(--border)', margin: '0 4px' }} />}
                </div>
              );
            })}
          </div>

          {/* STEP 1: UPLOAD & TEMPLATE DOWNLOAD */}
          {wizardStep === 1 && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, boxShadow: 'var(--shadow-soft)' }}>
              {/* Template Download Alert */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 14,
                  background: 'rgba(143,63,102,0.06)',
                  border: '1px solid rgba(143,63,102,0.2)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  marginBottom: 28,
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 2 }}>
                    Need the correct format? Download our sample CSV template
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Contains pre-formatted column headers, sample rows, and guidelines for {selectedType.toLowerCase()}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.88rem', flex: '1 1 auto', maxWidth: '100%', minHeight: 44 }}
                  onClick={() => handleDownloadTemplate(selectedType)}
                >
                  <Download size={16} /> Download {selectedType.charAt(0) + selectedType.slice(1).toLowerCase()} Template
                </button>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                style={{
                  border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
                  background: dragActive ? 'rgba(143,63,102,0.02)' : 'var(--surface)',
                  borderRadius: 16,
                  padding: '48px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: 24,
                }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      validateAndSetFile(e.target.files[0]);
                    }
                  }}
                />

                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(143,63,102,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: 'var(--primary)' }}>
                  <UploadCloud size={32} />
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>
                  Drag & drop your CSV here
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                  or
                </p>

                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '10px 24px', fontSize: '0.92rem', marginBottom: 16 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Choose CSV File
                </button>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                  Supported format: <strong>.csv</strong> &nbsp;•&nbsp; Maximum file size: <strong>10 MB</strong>
                </p>
              </div>

              {/* Error Message */}
              {uploadError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(201,87,87,0.1)', border: '1px solid rgba(201,87,87,0.3)', color: 'var(--danger)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <XCircle size={18} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.88rem' }}>{uploadError}</span>
                </div>
              )}

              {/* Selected File Card */}
              {selectedFile && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
                      <FileSpreadsheet size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB &nbsp;•&nbsp; Ready for validation
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ color: 'var(--danger)', fontSize: '0.85rem' }}
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Proceed Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!selectedFile || isValidating}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', fontSize: '0.95rem' }}
                  onClick={handleUploadAndValidate}
                >
                  Proceed to Validation <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: VALIDATING LOADER */}
          {wizardStep === 2 && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '64px 32px', textAlign: 'center', boxShadow: 'var(--shadow-soft)' }}>
              <Loader2 size={48} className="spin" color="var(--primary)" style={{ margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 8 }}>Validating CSV File...</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 450, margin: '0 auto' }}>
                Checking headers, verifying email formats, detecting duplicates, and cross-referencing existing records in the database.
              </p>
            </div>
          )}

          {/* STEP 3: PREVIEW & ERROR INSPECTION */}
          {wizardStep === 3 && previewData && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, boxShadow: 'var(--shadow-soft)' }}>
              {/* Header and Summary stats */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 4 }}>Import Preview</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    File: <strong>{previewData.fileName}</strong> &nbsp;•&nbsp; Type: <strong>{previewData.type}</strong>
                  </p>
                </div>

                {/* Badge pills */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ padding: '6px 14px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 600 }}>
                    Total Rows: <strong>{previewData.totalRows}</strong>
                  </div>
                  <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(43,138,91,0.1)', color: 'var(--success)', border: '1px solid rgba(43,138,91,0.2)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Valid: <strong>{previewData.validRows}</strong>
                  </div>
                  <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(207,159,75,0.1)', color: 'var(--warning)', border: '1px solid rgba(207,159,75,0.2)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={16} /> Warnings: <strong>{previewData.warningRows}</strong>
                  </div>
                  <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(201,87,87,0.1)', color: 'var(--danger)', border: '1px solid rgba(201,87,87,0.2)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <XCircle size={16} /> Errors: <strong>{previewData.invalidRows}</strong>
                  </div>
                </div>
              </div>

              {/* Action bar (Search, Filter Tabs, Download Error CSV) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Filter tabs */}
                  {(['all', 'valid', 'warning', 'error'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`btn ${previewFilter === filter ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: 8, textTransform: 'capitalize' }}
                      onClick={() => setPreviewFilter(filter)}
                    >
                      {filter === 'all' ? 'All Rows' : filter === 'error' ? 'Errors Only' : filter === 'warning' ? 'Warnings' : 'Valid'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 220 }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      placeholder="Search rows..."
                      value={previewSearch}
                      onChange={(e) => setPreviewSearch(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px 6px 32px', fontSize: '0.82rem', borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                  </div>

                  {previewData.errors.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '6px 14px', color: 'var(--danger)', borderColor: 'rgba(201,87,87,0.3)' }}
                      onClick={() => handleDownloadErrors()}
                    >
                      <Download size={14} /> Download Error CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                    <thead style={{ background: 'var(--surface-muted)', position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th style={{ padding: '10px 14px', width: 60, fontWeight: 700 }}>Row</th>
                        {previewData.type === 'ASSIGNMENTS' ? (
                          <>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Mentor (Phone / Email)</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Mentee (MAKID / Email)</th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Name</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>{previewData.type === 'MENTEES' ? 'MAKID' : 'Email'}</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Phone</th>
                            {previewData.type === 'MENTEES' && <th style={{ padding: '10px 14px', fontWeight: 700 }}>Standard</th>}
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                          </>
                        )}
                        <th style={{ padding: '10px 14px', fontWeight: 700 }}>Validation Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No rows matching the filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => {
                          const isErr = row.status === 'error';
                          const isWarn = row.status === 'warning';
                          return (
                            <tr
                              key={row.row}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                background: isErr ? 'rgba(201,87,87,0.04)' : isWarn ? 'rgba(207,159,75,0.04)' : '#fff',
                              }}
                            >
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>#{row.row}</td>
                              {previewData.type === 'ASSIGNMENTS' ? (
                                <>
                                  <td style={{ padding: '10px 14px' }}>{row.data.mentor_email || row.data.mentor_identifier || '—'}</td>
                                  <td style={{ padding: '10px 14px' }}>{row.data.mentee_makid || row.data.mentee_email || '—'}</td>
                                </>
                              ) : (
                                <>
                                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{row.data.name || '—'}</td>
                                  <td style={{ padding: '10px 14px' }}>{row.data.makid || row.data.email || '—'}</td>
                                  <td style={{ padding: '10px 14px' }}>{row.data.phone || '—'}</td>
                                  {previewData.type === 'MENTEES' && <td style={{ padding: '10px 14px' }}>{row.data.standard || '—'}</td>}
                                  <td style={{ padding: '10px 14px' }}>{row.data.status || 'Active'}</td>
                                </>
                              )}
                              <td style={{ padding: '10px 14px' }}>
                                {isErr ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontWeight: 600, fontSize: '0.8rem' }}>
                                    <XCircle size={16} /> <span>{row.message || 'Validation error'}</span>
                                  </div>
                                ) : isWarn ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warning)', fontWeight: 600, fontSize: '0.8rem' }}>
                                    <AlertTriangle size={16} /> <span>{row.message || 'Duplicate / Warning'}</span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontWeight: 600, fontSize: '0.8rem' }}>
                                    <CheckCircle2 size={16} /> <span>Valid</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Navigation buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, flex: '1 1 180px' }}
                  onClick={handleReset}
                >
                  <ArrowLeft size={16} /> Upload Different File
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 28px', fontSize: '0.95rem', minHeight: 44, flex: '1 1 200px' }}
                  onClick={() => setWizardStep(4)}
                >
                  Configure Import Settings <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: DUPLICATE SETTINGS & CONFIRMATION */}
          {wizardStep === 4 && previewData && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, boxShadow: 'var(--shadow-soft)' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 6 }}>Import Settings & Confirmation</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 28 }}>
                Configure how duplicates and existing assignments should be handled during the import.
              </p>

              {/* Duplicate Handling Section */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>If record already exists:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      background: duplicateAction === 'skip' ? 'rgba(143,63,102,0.06)' : '#fff',
                      border: `1px solid ${duplicateAction === 'skip' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      checked={duplicateAction === 'skip'}
                      onChange={() => setDuplicateAction('skip')}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Skip (Default)</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>Keep existing database record completely unchanged.</div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      background: duplicateAction === 'update' ? 'rgba(143,63,102,0.06)' : '#fff',
                      border: `1px solid ${duplicateAction === 'update' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      checked={duplicateAction === 'update'}
                      onChange={() => setDuplicateAction('update')}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Update</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>Update the existing database record with the new values from CSV.</div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      background: duplicateAction === 'ask' ? 'rgba(143,63,102,0.06)' : '#fff',
                      border: `1px solid ${duplicateAction === 'ask' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      checked={duplicateAction === 'ask'}
                      onChange={() => setDuplicateAction('ask')}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Ask</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>Show duplicates in preview table and let admin inspect manually.</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Assignment Reassignment Alert & Toggle */}
              {previewData.type === 'ASSIGNMENTS' && (
                <div style={{ background: 'rgba(93,126,184,0.06)', border: '1px solid rgba(93,126,184,0.2)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <ShieldAlert size={20} color="var(--info)" />
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Reassignment Policy</h4>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                    If a mentee in the CSV is currently assigned to another mentor, you can choose whether to reassign them to the new mentor or keep their current mentor.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={reassignMentees}
                      onChange={(e) => setReassignMentees(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                    />
                    Automatically reassign mentees to new mentors (archives prior assignment)
                  </label>
                </div>
              )}

              {/* Ready to Import Summary Box */}
              <div
                style={{
                  background: 'rgba(43,138,91,0.06)',
                  border: '1px solid rgba(43,138,91,0.2)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  marginBottom: 28,
                }}
              >
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={20} /> Ready to Import
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.8 }}>
                  <li>
                    <strong>{previewData.validRows}</strong> valid records will be imported immediately.
                  </li>
                  {previewData.warningRows > 0 && (
                    <li>
                      <strong>{previewData.warningRows}</strong> records have warnings ({duplicateAction === 'skip' ? 'will be skipped' : duplicateAction === 'update' ? 'will update existing records' : 'will be handled per rule'}).
                    </li>
                  )}
                  {previewData.invalidRows > 0 && (
                    <li style={{ color: 'var(--danger)' }}>
                      <strong>{previewData.invalidRows}</strong> invalid records will be skipped (you can download the error CSV report).
                    </li>
                  )}
                </ul>
              </div>

              {/* Confirmation Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ minHeight: 44, flex: '1 1 140px', justifyContent: 'center' }}
                  onClick={() => setWizardStep(3)}
                >
                  <ArrowLeft size={16} style={{ marginRight: 6 }} /> Back to Preview
                </button>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 220px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ minHeight: 44 }}
                    onClick={handleReset}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '12px 28px', fontSize: '0.95rem', minHeight: 44, flex: '1 1 auto' }}
                    onClick={handleStartImport}
                  >
                    Import {previewData.validRows + (duplicateAction === 'update' ? previewData.warningRows : 0)} Records
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: LIVE PROGRESS SCREEN */}
          {wizardStep === 5 && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-soft)' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Loader2 size={24} className="spin" color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                Importing {selectedType.toLowerCase()}...
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 28 }}>
                Processing batch database transactions securely in the background.
              </p>

              {/* Animated Progress Bar */}
              {(() => {
                const total = progressData?.totalRows || previewData?.totalRows || 1;
                const processed = (progressData?.createdCount || 0) + (progressData?.updatedCount || 0) + (progressData?.skippedCount || 0) + (progressData?.failedCount || 0);
                const percent = Math.min(100, Math.round((processed / total) * 100));

                return (
                  <div style={{ maxWidth: 500, margin: '0 auto 32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, marginBottom: 8 }}>
                      <span>{percent}%</span>
                      <span>{processed} / {total} records processed</span>
                    </div>
                    <div style={{ width: '100%', height: 12, background: 'var(--surface-muted)', borderRadius: 10, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${percent}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--primary) 0%, var(--primary-hover) 100%)',
                          borderRadius: 10,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Progress Count Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, maxWidth: 650, margin: '0 auto' }}>
                <div style={{ background: 'var(--surface)', padding: '14px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>{progressData?.createdCount || 0}</div>
                </div>
                <div style={{ background: 'var(--surface)', padding: '14px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Updated</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--info)' }}>{progressData?.updatedCount || 0}</div>
                </div>
                <div style={{ background: 'var(--surface)', padding: '14px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Skipped</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)' }}>{progressData?.skippedCount || 0}</div>
                </div>
                <div style={{ background: 'var(--surface)', padding: '14px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Failed</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--danger)' }}>{progressData?.failedCount || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: IMPORT RESULT / COMPLETED */}
          {wizardStep === 6 && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-soft)' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(43,138,91,0.12)', display: 'grid', placeItems: 'center', color: 'var(--success)', margin: '0 auto 20px' }}>
                <CheckCircle2 size={40} />
              </div>

              <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
                Import Completed
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 28 }}>
                All records have been processed and integrated with the platform.
              </p>

              {/* Statistics Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, maxWidth: 650, margin: '0 auto 36px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Total Processed</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{progressData?.totalRows || previewData?.totalRows || 0}</div>
                </div>
                <div style={{ background: 'rgba(43,138,91,0.06)', border: '1px solid rgba(43,138,91,0.2)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{progressData?.createdCount || 0}</div>
                </div>
                <div style={{ background: 'rgba(93,126,184,0.06)', border: '1px solid rgba(93,126,184,0.2)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--info)', marginBottom: 4 }}>Updated</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--info)' }}>{progressData?.updatedCount || 0}</div>
                </div>
                <div style={{ background: 'rgba(207,159,75,0.06)', border: '1px solid rgba(207,159,75,0.2)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', marginBottom: 4 }}>Skipped</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>{progressData?.skippedCount || 0}</div>
                </div>
                <div style={{ background: 'rgba(201,87,87,0.06)', border: '1px solid rgba(201,87,87,0.2)', borderRadius: 12, padding: '16px 12px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: 4 }}>Failed</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>{progressData?.failedCount || 0}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: '0.92rem' }}
                  onClick={() => {
                    if (selectedType === 'MENTORS') navigate('/admin/mentors');
                    else if (selectedType === 'MENTEES') navigate('/admin/mentees');
                    else navigate('/admin/assignments');
                  }}
                >
                  <ExternalLink size={16} /> View Imported Records
                </button>

                {(progressData?.failedCount || 0) > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: '0.92rem', color: 'var(--danger)' }}
                    onClick={() => handleDownloadErrors()}
                  >
                    <Download size={16} /> Download Error Report
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: '0.92rem' }}
                  onClick={handleReset}
                >
                  <RotateCcw size={16} /> Import Another File
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: IMPORT HISTORY
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 4 }}>Import History</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Audit log of all CSV bulk imports performed across the platform.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              onClick={loadHistory}
            >
              <RotateCcw size={15} /> Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Loader2 size={32} className="spin" color="var(--primary)" style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Loading import history...</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No import history found. Upload a CSV file to get started!
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="desktop-table">
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                      <thead style={{ background: 'var(--surface-muted)' }}>
                        <tr>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Date</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Type</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>File Name</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Total</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Created</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Updated</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Skipped / Failed</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Imported By</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyItems.map((job) => (
                          <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              {new Date(job.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 14,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background:
                                    job.type === 'MENTORS'
                                      ? 'rgba(143,63,102,0.1)'
                                      : job.type === 'MENTEES'
                                      ? 'rgba(43,138,91,0.1)'
                                      : 'rgba(93,126,184,0.1)',
                                  color:
                                    job.type === 'MENTORS'
                                      ? 'var(--primary)'
                                      : job.type === 'MENTEES'
                                      ? 'var(--success)'
                                      : 'var(--info)',
                                }}
                              >
                                {job.type}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{job.fileName}</td>
                            <td style={{ padding: '12px 16px' }}>{job.totalRows}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--success)', fontWeight: 600 }}>{job.createdCount}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--info)', fontWeight: 600 }}>{job.updatedCount}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{job.skippedCount}</span> /{' '}
                              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{job.failedCount}</span>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{job.uploadedBy}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                  onClick={() => setSelectedHistoryJob(job)}
                                >
                                  Details
                                </button>
                                {job.errorCount > 0 && (
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', color: 'var(--danger)' }}
                                    onClick={() => handleDownloadErrors(job.id)}
                                  >
                                    Errors CSV
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Mobile Card List */}
              <div className="mobile-card-list">
                {historyItems.map((job) => (
                  <div key={job.id} className="mobile-card" style={{ padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                          {job.fileName}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {new Date(job.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · By {job.uploadedBy}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: 14,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background:
                            job.type === 'MENTORS'
                              ? 'rgba(143,63,102,0.1)'
                              : job.type === 'MENTEES'
                              ? 'rgba(43,138,91,0.1)'
                              : 'rgba(93,126,184,0.1)',
                          color:
                            job.type === 'MENTORS'
                              ? 'var(--primary)'
                              : job.type === 'MENTEES'
                              ? 'var(--success)'
                              : 'var(--info)',
                          flexShrink: 0,
                        }}
                      >
                        {job.type}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                        padding: '10px 8px',
                        background: 'var(--surface-muted)',
                        borderRadius: 10,
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Total</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{job.totalRows}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--success)' }}>Created</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--success)' }}>{job.createdCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--info)' }}>Updated</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--info)' }}>{job.updatedCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>Failed</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--danger)' }}>{job.failedCount}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, minHeight: 40, justifyContent: 'center' }}
                        onClick={() => setSelectedHistoryJob(job)}
                      >
                        Details
                      </button>
                      {job.errorCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ flex: 1, minHeight: 40, justifyContent: 'center', color: 'var(--danger)' }}
                          onClick={() => handleDownloadErrors(job.id)}
                        >
                          Errors CSV
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Job Details Modal */}
          {selectedHistoryJob && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                padding: 20,
              }}
              onClick={() => setSelectedHistoryJob(null)}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: 28,
                  maxWidth: 550,
                  width: '100%',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Import Details</h3>
                  <button type="button" className="btn-ghost" onClick={() => setSelectedHistoryJob(null)}>
                    ✕
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: '0.88rem', marginBottom: 20 }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>File Name:</span>
                    <div style={{ fontWeight: 600 }}>{selectedHistoryJob.fileName}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Import Type:</span>
                    <div style={{ fontWeight: 600 }}>{selectedHistoryJob.type}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Uploaded By:</span>
                    <div style={{ fontWeight: 600 }}>{selectedHistoryJob.uploadedBy}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Date:</span>
                    <div style={{ fontWeight: 600 }}>{new Date(selectedHistoryJob.createdAt).toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Created</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{selectedHistoryJob.createdCount}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Updated</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--info)' }}>{selectedHistoryJob.updatedCount}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Skipped</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning)' }}>{selectedHistoryJob.skippedCount}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Failed</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>{selectedHistoryJob.failedCount}</div>
                  </div>
                </div>

                {selectedHistoryJob.errorCount > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--danger)' }}
                    onClick={() => handleDownloadErrors(selectedHistoryJob.id)}
                  >
                    <Download size={16} /> Download Error Report CSV
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: BULK DATA EXPORT (REVERSE FUNCTIONALITY)
      ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, boxShadow: 'var(--shadow-soft)' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 6 }}>Export Platform Data</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 28 }}>
            Export mentors, mentees, assignments, mentorship calls, and daily performance records as clean, formula-injection-protected CSV files.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
            {/* Category Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Data Category</label>
              <select
                value={exportCategory}
                onChange={(e) => setExportCategory(e.target.value as any)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.9rem' }}
              >
                <option value="mentors">Mentors List</option>
                <option value="mentees">Mentees List</option>
                <option value="assignments">Mentor-Mentee Assignments</option>
                <option value="calls">Mentorship Call Records</option>
                <option value="performance">Daily Performance Entries</option>
              </select>
            </div>

            {/* Status Filter */}
            {['mentors', 'mentees', 'assignments', 'calls'].includes(exportCategory) && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Status</label>
                <select
                  value={exportStatusFilter}
                  onChange={(e) => setExportStatusFilter(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.9rem' }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive / Disabled</option>
                  {exportCategory === 'calls' && (
                    <>
                      <option value="Approved">Approved</option>
                      <option value="Pending Review">Pending Review</option>
                      <option value="Rejected">Rejected</option>
                    </>
                  )}
                </select>
              </div>
            )}

            {/* Standard Filter for Mentees */}
            {exportCategory === 'mentees' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Standard / Class</label>
                <select
                  value={exportStandardFilter}
                  onChange={(e) => setExportStandardFilter(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.9rem' }}
                >
                  <option value="All">All Standards</option>
                  <option value="8">Class 8</option>
                  <option value="9">Class 9</option>
                  <option value="10">Class 10</option>
                  <option value="11">Class 11</option>
                  <option value="12">Class 12</option>
                  <option value="College">College</option>
                </select>
              </div>
            )}

            {/* Date Filter for Performance */}
            {exportCategory === 'performance' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Filter by Date (Optional)</label>
                <input
                  type="date"
                  value={exportDateFilter}
                  onChange={(e) => setExportDateFilter(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.9rem' }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={isExporting}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', fontSize: '0.95rem' }}
              onClick={handleExportData}
            >
              {isExporting ? (
                <>
                  <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Exporting CSV...
                </>
              ) : (
                <>
                  <FileSpreadsheet size={18} /> Export CSV
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
