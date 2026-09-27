import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { ImportJob, ImportType, DuplicateStrategy } from '../models/ImportJob.js';
import {
  getTemplateCsv,
  createAndValidateImportJob,
  executeImportJob,
  generateErrorCsv,
  exportBulkData,
} from '../services/bulkImportService.js';

const router = Router();

// Multer memory storage configured with 10MB limit and CSV filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error(`Invalid file type "${ext || 'unknown'}". Only .csv files are supported.`));
    }
    cb(null, true);
  },
});

// Middleware to handle Multer errors cleanly
const handleUploadError = (err: any, _req: any, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum allowed file size is 10 MB.' });
    }
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

/**
 * GET /api/import/templates/:type
 * Download CSV template (mentors | mentees | assignments)
 */
router.get('/templates/:type', requireAuth, requireRole('ADMIN'), (req: AuthRequest, res: Response) => {
  const typeParam = String(req.params.type).toUpperCase() as ImportType;
  if (!['MENTORS', 'MENTEES', 'ASSIGNMENTS'].includes(typeParam)) {
    return res.status(400).json({ message: 'Invalid template type. Use mentors, mentees, or assignments.' });
  }

  const csv = getTemplateCsv(typeParam);
  const fileName = `${typeParam.toLowerCase()}_template.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(csv);
});

/**
 * POST /api/import/upload/:type and POST /api/import/:type
 * Upload CSV and run validation, creating READY ImportJob
 */
const handleUploadAndValidate = async (req: AuthRequest, res: Response) => {
  try {
    const rawType = String(req.params.type).toUpperCase();
    if (!['MENTORS', 'MENTEES', 'ASSIGNMENTS'].includes(rawType)) {
      return res.status(400).json({ message: 'Invalid import type. Use mentors, mentees, or assignments.' });
    }
    const typeParam = rawType as ImportType;

    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file was uploaded.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const adminEmailOrId = req.user?.email || req.user?.id || 'Admin';

    const result = await createAndValidateImportJob(
      typeParam,
      req.file.originalname,
      req.file.size,
      adminEmailOrId,
      csvContent,
    );

    return res.status(201).json({
      message: 'CSV file parsed and validated successfully.',
      importJobId: result.importJobId,
      preview: result.preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse and validate CSV file.';
    return res.status(400).json({ message });
  }
};

router.post('/upload/:type', requireAuth, requireRole('ADMIN'), upload.single('file'), handleUploadError, handleUploadAndValidate);
router.post('/mentors', requireAuth, requireRole('ADMIN'), (req: AuthRequest, _res: Response, next: NextFunction) => { req.params.type = 'mentors'; next(); }, upload.single('file'), handleUploadError, handleUploadAndValidate);
router.post('/mentees', requireAuth, requireRole('ADMIN'), (req: AuthRequest, _res: Response, next: NextFunction) => { req.params.type = 'mentees'; next(); }, upload.single('file'), handleUploadError, handleUploadAndValidate);
router.post('/assignments', requireAuth, requireRole('ADMIN'), (req: AuthRequest, _res: Response, next: NextFunction) => { req.params.type = 'assignments'; next(); }, upload.single('file'), handleUploadError, handleUploadAndValidate);

/**
 * POST /api/import/:importId/validate
 * Re-validates existing job if needed
 */
router.post('/:importId/validate', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const importId = Array.isArray(req.params.importId) ? req.params.importId[0] : String(req.params.importId);
    const job = await ImportJob.findById(importId);
    if (!job) {
      return res.status(404).json({ message: 'Import job not found.' });
    }
    return res.json({
      message: 'Validation successful.',
      id: String(job._id),
      validRows: job.validRows,
      warningRows: job.warningRows,
      invalidRows: job.invalidRows,
      totalRows: job.totalRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/import/history
 * List all import history jobs
 */
router.get('/history', requireAuth, requireRole('ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const jobs = await ImportJob.find()
      .select('-rawCsvContent -parsedRows')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      history: jobs.map((j) => ({
        id: String(j._id),
        type: j.type,
        fileName: j.fileName,
        fileSize: j.fileSize,
        uploadedBy: j.uploadedBy,
        status: j.status,
        totalRows: j.totalRows,
        validRows: j.validRows,
        warningRows: j.warningRows,
        invalidRows: j.invalidRows,
        createdCount: j.createdCount,
        updatedCount: j.updatedCount,
        skippedCount: j.skippedCount,
        failedCount: j.failedCount,
        errorCount: j.errors?.length || 0,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch import history.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/import/:importId/preview
 * Get preview details for a specific import job
 */
router.get('/:importId/preview', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const job = await ImportJob.findById(req.params.importId).lean();
    if (!job) {
      return res.status(404).json({ message: 'Import job not found.' });
    }

    return res.json({
      id: String(job._id),
      type: job.type,
      fileName: job.fileName,
      status: job.status,
      totalRows: job.totalRows,
      validRows: job.validRows,
      warningRows: job.warningRows,
      invalidRows: job.invalidRows,
      previewRows: (job.parsedRows || []).slice(0, 200),
      errors: (job.errors || []).slice(0, 200),
      totalErrors: job.errors?.length || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch preview.';
    return res.status(500).json({ message });
  }
});

/**
 * POST /api/import/:importId/confirm
 * Confirm and initiate execution of the bulk import
 */
router.post('/:importId/confirm', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const importId = Array.isArray(req.params.importId) ? req.params.importId[0] : String(req.params.importId);
    const { duplicateAction, reassignMentees } = req.body;
    const strategy = (duplicateAction || 'skip') as DuplicateStrategy;

    await executeImportJob(importId, strategy, reassignMentees !== false);

    return res.json({
      message: 'Import processing started in background.',
      status: 'PROCESSING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start import processing.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/import/:importId/status
 * Check current progress and completion status
 */
router.get('/:importId/status', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const importId = Array.isArray(req.params.importId) ? req.params.importId[0] : String(req.params.importId);
    const job = await ImportJob.findById(importId)
      .select('status totalRows validRows invalidRows warningRows createdCount updatedCount skippedCount failedCount errors startedAt completedAt')
      .lean();

    if (!job) {
      return res.status(404).json({ message: 'Import job not found.' });
    }

    return res.json({
      id: String(job._id),
      status: job.status,
      totalRows: job.totalRows,
      validRows: job.validRows,
      invalidRows: job.invalidRows,
      warningRows: job.warningRows,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      errorCount: (job as any).errors?.length || 0,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch import status.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/import/:importId/errors
 * Download error report CSV for a job
 */
router.get('/:importId/errors', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const importId = Array.isArray(req.params.importId) ? req.params.importId[0] : String(req.params.importId);
    const job = await ImportJob.findById(importId).lean();
    if (!job) {
      return res.status(404).json({ message: 'Import job not found.' });
    }

    const csvContent = generateErrorCsv(job);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="import_errors_${job._id}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate error CSV.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/import/:importId
 * Single import job full details
 */
router.get('/:importId', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const importId = Array.isArray(req.params.importId) ? req.params.importId[0] : String(req.params.importId);
    const job = await ImportJob.findById(importId).lean();
    if (!job) {
      return res.status(404).json({ message: 'Import job not found.' });
    }

    return res.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch job details.';
    return res.status(500).json({ message });
  }
});

/**
 * GET /api/export/:category
 * Bulk export data as CSV with filters
 */
router.get('/export/:category', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const category = req.params.category as 'mentors' | 'mentees' | 'assignments' | 'calls' | 'performance';
    const filters = req.query as Record<string, string>;

    const { fileName, csvContent } = await exportBulkData(category, filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(csvContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export data.';
    return res.status(500).json({ message });
  }
});

export default router;
