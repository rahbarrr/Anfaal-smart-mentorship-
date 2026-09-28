import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Mentor } from '../models/Mentor.js';
import { Mentee } from '../models/Mentee.js';
import { Mentorship } from '../models/Mentorship.js';
import { Call } from '../models/Call.js';
import { DailyPerformance } from '../models/DailyPerformance.js';
import { ImportJob, ImportType, ImportErrorItem, ParsedRowItem, DuplicateStrategy } from '../models/ImportJob.js';
import { parseCsv, generateCsvString, normalizeEmail, normalizePhone, normalizeStatus } from './csvParserService.js';

// Regex for standard email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Downloadable CSV Templates
 */
export function getTemplateCsv(type: ImportType): string {
  switch (type) {
    case 'MENTORS':
      return [
        'name,email,phone,gender,status',
        'Ahmed Khan,ahmed@example.com,9876543210,Male,Active',
        'Sara Shaikh,sara@example.com,9876543211,Female,Active',
        'Zaid Patel,zaid@example.com,9876543212,Male,Active',
      ].join('\r\n');

    case 'MENTEES':
      return [
        'name,email,phone,standard,gender,status',
        'Arif Khan,arif@example.com,9876543210,10,Male,Active',
        'Ayesha Shaikh,ayesha@example.com,9876543211,9,Female,Active',
        'Bilal Siddiqui,bilal@example.com,9876543212,11,Male,Active',
      ].join('\r\n');

    case 'ASSIGNMENTS':
      return [
        'mentor_email,mentee_email',
        'ahmed@example.com,arif@example.com',
        'ahmed@example.com,ayesha@example.com',
        'sara@example.com,bilal@example.com',
      ].join('\r\n');

    default:
      return '';
  }
}

/**
 * Validate and create an ImportJob from uploaded CSV content
 */
export async function createAndValidateImportJob(
  type: ImportType,
  fileName: string,
  fileSize: number,
  uploadedBy: string,
  csvContent: string,
): Promise<{ importJobId: string; preview: any }> {
  const { headers, rows, parseErrors } = parseCsv(csvContent);

  if (parseErrors.length > 0 && rows.length === 0) {
    throw new Error(parseErrors.join('; '));
  }

  const errors: ImportErrorItem[] = [];
  const parsedRows: ParsedRowItem[] = [];

  let validRowsCount = 0;
  let warningRowsCount = 0;
  let invalidRowsCount = 0;

  if (type === 'MENTORS') {
    // Check required header
    const hasName = headers.includes('name');
    const hasEmail = headers.includes('email');
    if (!hasName || !hasEmail) {
      throw new Error('Mentor CSV must include "name" and "email" columns.');
    }

    const seenEmailsInCsv = new Set<string>();

    for (const r of rows) {
      const name = (r.data.name || '').trim();
      const rawEmail = (r.data.email || '').trim();
      const email = normalizeEmail(rawEmail);
      const phone = normalizePhone(r.data.phone);
      const gender = (r.data.gender || '').trim();
      const rawStatus = (r.data.status || 'Active').trim();
      const status = normalizeStatus(rawStatus, 'active');

      const rowItem: ParsedRowItem = {
        row: r.rowNumber,
        status: 'valid',
        data: { name, email, phone, gender, status: rawStatus },
      };

      // 1. Check required fields
      if (!name) {
        errors.push({ row: r.rowNumber, name, email, error: 'Name is required' });
        rowItem.status = 'error';
        rowItem.message = 'Name is required';
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      if (!email) {
        errors.push({ row: r.rowNumber, name, email, error: 'Email is required' });
        rowItem.status = 'error';
        rowItem.message = 'Email is required';
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // 2. Validate email format
      if (!EMAIL_REGEX.test(email)) {
        errors.push({ row: r.rowNumber, name, email, error: 'Invalid email address' });
        rowItem.status = 'error';
        rowItem.message = 'Invalid email address';
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // 3. Check duplicate inside CSV
      if (seenEmailsInCsv.has(email)) {
        errors.push({ row: r.rowNumber, name, email, error: `Duplicate email "${email}" in CSV`, warning: true });
        rowItem.status = 'warning';
        rowItem.message = `Duplicate email "${email}" in CSV file`;
        warningRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }
      seenEmailsInCsv.add(email);

      // 4. Check existing in database
      const existingUser = await User.findOne({ email }).lean();
      if (existingUser) {
        rowItem.status = 'warning';
        rowItem.isExisting = true;
        rowItem.message = `Mentor "${email}" already exists in database`;
        errors.push({ row: r.rowNumber, name, email, error: `Mentor "${email}" already exists`, warning: true });
        warningRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // Valid row
      validRowsCount++;
      parsedRows.push(rowItem);
    }
  } else if (type === 'MENTEES') {
    const hasName = headers.includes('name');
    if (!hasName) {
      throw new Error('Mentee CSV must include a "name" column.');
    }

    const seenEmailsInCsv = new Set<string>();

    for (const r of rows) {
      const name = (r.data.name || '').trim();
      const rawEmail = (r.data.email || '').trim();
      const email = normalizeEmail(rawEmail);
      const phone = normalizePhone(r.data.phone);
      const standard = (r.data.standard || '10').trim();
      const gender = (r.data.gender || '').trim();
      const rawStatus = (r.data.status || 'Active').trim();
      const status = normalizeStatus(rawStatus, 'active');

      const rowItem: ParsedRowItem = {
        row: r.rowNumber,
        status: 'valid',
        data: { name, email, phone, standard, gender, status: rawStatus },
      };

      // 1. Required name check
      if (!name) {
        errors.push({ row: r.rowNumber, name, email, error: 'Name is required' });
        rowItem.status = 'error';
        rowItem.message = 'Name is required';
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // 2. Validate email if provided
      if (email) {
        if (!EMAIL_REGEX.test(email)) {
          errors.push({ row: r.rowNumber, name, email, error: 'Invalid email address' });
          rowItem.status = 'error';
          rowItem.message = 'Invalid email address';
          invalidRowsCount++;
          parsedRows.push(rowItem);
          continue;
        }

        if (seenEmailsInCsv.has(email)) {
          errors.push({ row: r.rowNumber, name, email, error: `Duplicate email "${email}" in CSV`, warning: true });
          rowItem.status = 'warning';
          rowItem.message = `Duplicate email "${email}" in CSV file`;
          warningRowsCount++;
          parsedRows.push(rowItem);
          continue;
        }
        seenEmailsInCsv.add(email);

        // Check if existing user or mentee with email
        const existingMenteeWithEmail = await Mentee.findOne({
          $or: [{ 'contactInformation.email': email }, { name: new RegExp(`^${name}$`, 'i') }],
        }).lean();

        if (existingMenteeWithEmail) {
          rowItem.status = 'warning';
          rowItem.isExisting = true;
          rowItem.message = `Mentee with email "${email}" or name "${name}" already exists`;
          errors.push({ row: r.rowNumber, name, email, error: `Mentee already exists in database`, warning: true });
          warningRowsCount++;
          parsedRows.push(rowItem);
          continue;
        }
      } else {
        // Name duplicate check
        const existingMentee = await Mentee.findOne({ name: new RegExp(`^${name}$`, 'i') }).lean();
        if (existingMentee) {
          rowItem.status = 'warning';
          rowItem.isExisting = true;
          rowItem.message = `Mentee with name "${name}" already exists`;
          errors.push({ row: r.rowNumber, name, email: '', error: `Mentee with name "${name}" already exists`, warning: true });
          warningRowsCount++;
          parsedRows.push(rowItem);
          continue;
        }
      }

      validRowsCount++;
      parsedRows.push(rowItem);
    }
  } else if (type === 'ASSIGNMENTS') {
    const hasMentorEmail = headers.includes('mentor_email') || headers.includes('mentoremail');
    const hasMenteeEmail = headers.includes('mentee_email') || headers.includes('menteeemail');
    if (!hasMentorEmail || !hasMenteeEmail) {
      throw new Error('Assignment CSV must include "mentor_email" and "mentee_email" columns.');
    }

    const mentorCol = headers.find((h) => h.includes('mentor')) || 'mentor_email';
    const menteeCol = headers.find((h) => h.includes('mentee')) || 'mentee_email';

    for (const r of rows) {
      const mentorEmail = normalizeEmail(r.data[mentorCol]);
      const menteeEmail = normalizeEmail(r.data[menteeCol]);

      const rowItem: ParsedRowItem = {
        row: r.rowNumber,
        status: 'valid',
        data: { mentor_email: mentorEmail, mentee_email: menteeEmail },
      };

      if (!mentorEmail || !menteeEmail) {
        const missing = !mentorEmail && !menteeEmail ? 'Mentor and Mentee email' : !mentorEmail ? 'Mentor email' : 'Mentee email';
        errors.push({ row: r.rowNumber, email: mentorEmail || menteeEmail, error: `${missing} is required` });
        rowItem.status = 'error';
        rowItem.message = `${missing} is required`;
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      if (!EMAIL_REGEX.test(mentorEmail) || !EMAIL_REGEX.test(menteeEmail)) {
        errors.push({ row: r.rowNumber, email: `${mentorEmail} -> ${menteeEmail}`, error: 'Invalid email format' });
        rowItem.status = 'error';
        rowItem.message = 'Invalid email format';
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // Check mentor exists
      const mentorUser = await User.findOne({ email: mentorEmail, role: 'MENTOR' }).lean();
      if (!mentorUser) {
        errors.push({ row: r.rowNumber, email: mentorEmail, error: `Mentor "${mentorEmail}" does not exist` });
        rowItem.status = 'error';
        rowItem.message = `Mentor "${mentorEmail}" does not exist`;
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      const mentorDoc = await Mentor.findOne({ userId: String(mentorUser._id) }).lean();
      if (!mentorDoc) {
        errors.push({ row: r.rowNumber, email: mentorEmail, error: `Mentor profile for "${mentorEmail}" not found` });
        rowItem.status = 'error';
        rowItem.message = `Mentor profile not found`;
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // Check mentee exists
      let menteeDoc = await Mentee.findOne({
        $or: [
          { 'contactInformation.email': menteeEmail },
          { name: new RegExp(`^${menteeEmail}$`, 'i') },
        ],
      }).lean();

      if (!menteeDoc) {
        // Try looking up mentee User
        const menteeUser = await User.findOne({ email: menteeEmail }).lean();
        if (menteeUser && menteeUser.menteeId) {
          menteeDoc = await Mentee.findById(menteeUser.menteeId).lean();
        }
      }

      if (!menteeDoc) {
        errors.push({ row: r.rowNumber, email: menteeEmail, error: `Mentee "${menteeEmail}" does not exist` });
        rowItem.status = 'error';
        rowItem.message = `Mentee "${menteeEmail}" does not exist`;
        invalidRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      const mentorId = String(mentorDoc._id);
      const menteeId = String(menteeDoc._id);
      rowItem.data.resolvedMentorId = mentorId;
      rowItem.data.resolvedMenteeId = menteeId;
      rowItem.data.mentorName = mentorUser.name;
      rowItem.data.menteeName = menteeDoc.name;

      // Check if relationship already exists
      const existingAssignment = await Mentorship.findOne({ mentorId, menteeId, status: 'active' }).lean();
      if (existingAssignment) {
        rowItem.status = 'warning';
        rowItem.isExisting = true;
        rowItem.message = `Relationship already active between ${mentorUser.name} and ${menteeDoc.name}`;
        errors.push({
          row: r.rowNumber,
          email: `${mentorEmail} -> ${menteeEmail}`,
          error: `Relationship already active`,
          warning: true,
        });
        warningRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      // Check if mentee is currently assigned to another mentor
      const otherAssignment = await Mentorship.findOne({ menteeId, status: 'active' }).lean();
      if (otherAssignment && otherAssignment.mentorId !== mentorId) {
        const otherMentor = await Mentor.findById(otherAssignment.mentorId).lean();
        const otherUser = otherMentor ? await User.findById(otherMentor.userId).lean() : null;
        const otherMentorName = otherUser?.name || 'another mentor';

        rowItem.status = 'warning';
        rowItem.data.isReassignment = true;
        rowItem.data.currentMentorName = otherMentorName;
        rowItem.message = `Mentee "${menteeDoc.name}" is currently assigned to ${otherMentorName}. Will be reassigned if confirmed.`;
        errors.push({
          row: r.rowNumber,
          name: menteeDoc.name,
          email: menteeEmail,
          error: `Currently assigned to ${otherMentorName}`,
          warning: true,
        });
        warningRowsCount++;
        parsedRows.push(rowItem);
        continue;
      }

      validRowsCount++;
      parsedRows.push(rowItem);
    }
  }

  // Create ImportJob record in DB
  const job = await ImportJob.create({
    type,
    fileName,
    fileSize,
    uploadedBy,
    status: 'READY',
    totalRows: rows.length,
    validRows: validRowsCount,
    warningRows: warningRowsCount,
    invalidRows: invalidRowsCount,
    duplicateAction: 'skip',
    parsedRows,
    errors,
    rawCsvContent: csvContent,
  });

  const preview = {
    id: String(job._id),
    type: job.type,
    fileName: job.fileName,
    totalRows: job.totalRows,
    validRows: job.validRows,
    warningRows: job.warningRows,
    invalidRows: job.invalidRows,
    previewRows: parsedRows.slice(0, 100),
    errors: errors.slice(0, 100),
  };

  return { importJobId: String(job._id), preview };
}

/**
 * Execute the background import process for an ImportJob
 */
export async function executeImportJob(
  jobId: string,
  duplicateAction: DuplicateStrategy = 'skip',
  reassignMentees = true,
): Promise<void> {
  const job = await ImportJob.findById(jobId);
  if (!job) {
    throw new Error('Import job not found');
  }

  if (job.status === 'PROCESSING' || job.status === 'COMPLETED') {
    return;
  }

  job.status = 'PROCESSING';
  job.duplicateAction = duplicateAction;
  job.startedAt = new Date();
  await job.save();

  // Run asynchronously without blocking HTTP response
  setImmediate(async () => {
    try {
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      const defaultMentorPassword = await bcrypt.hash('Mentor@123', 10);
      const defaultMenteePassword = await bcrypt.hash('Mentee@123', 10);

      for (const rowItem of job.parsedRows) {
        if (rowItem.status === 'error') {
          failedCount++;
          continue;
        }

        try {
          if (job.type === 'MENTORS') {
            const { name, email, phone, gender, status } = rowItem.data;
            const existingUser = await User.findOne({ email });

            // Default password of each mentor is their phone number, fallback to Mentor@123
            const cleanPhone = (phone || '').trim().replace(/\s+/g, '');
            const mentorPassword = cleanPhone || 'Mentor@123';
            const mentorPasswordHash = await bcrypt.hash(mentorPassword, 10);

            if (existingUser) {
              if (duplicateAction === 'update') {
                existingUser.name = name || existingUser.name;
                existingUser.status = status?.toLowerCase() === 'disabled' ? 'disabled' : 'active';
                if (cleanPhone) {
                  existingUser.passwordHash = mentorPasswordHash;
                }
                await existingUser.save();

                await Mentor.findOneAndUpdate(
                  { userId: String(existingUser._id) },
                  {
                    phone: phone || undefined,
                    gender: gender || undefined,
                    status: existingUser.status,
                  },
                );
                updatedCount++;
              } else {
                // skip
                skippedCount++;
              }
            } else {
              // Create new user & mentor
              const newUser = await User.create({
                name,
                email,
                passwordHash: mentorPasswordHash,
                role: 'MENTOR',
                status: status?.toLowerCase() === 'disabled' ? 'disabled' : 'active',
              });

              await Mentor.create({
                userId: String(newUser._id),
                phone: phone || '',
                gender: gender || '',
                bio: '',
                status: newUser.status,
              });

              createdCount++;
            }
          } else if (job.type === 'MENTEES') {
            const { name, email, phone, standard, gender, status } = rowItem.data;

            const existingMentee = email
              ? await Mentee.findOne({
                  $or: [{ 'contactInformation.email': email }, { name: new RegExp(`^${name}$`, 'i') }],
                })
              : await Mentee.findOne({ name: new RegExp(`^${name}$`, 'i') });

            if (existingMentee) {
              if (duplicateAction === 'update') {
                existingMentee.name = name || existingMentee.name;
                existingMentee.standard = standard || existingMentee.standard;
                existingMentee.status = status?.toLowerCase() === 'inactive' ? 'inactive' : 'active';

                const contact = (existingMentee.contactInformation as Record<string, any>) || {};
                if (phone) contact.phone = phone;
                if (email) contact.email = email;
                if (gender) contact.gender = gender;
                existingMentee.contactInformation = contact;
                await existingMentee.save();

                updatedCount++;
              } else {
                skippedCount++;
              }
            } else {
              // Create new mentee
              let createdUserId: string | undefined = undefined;

              if (email) {
                let userDoc = await User.findOne({ email });
                if (!userDoc) {
                  userDoc = await User.create({
                    name,
                    email,
                    passwordHash: defaultMenteePassword,
                    role: 'MENTEE',
                    status: status?.toLowerCase() === 'inactive' ? 'disabled' : 'active',
                  });
                }
                createdUserId = String(userDoc._id);
              }

              const newMentee = await Mentee.create({
                name,
                standard: standard || '10',
                contactInformation: {
                  email: email || '',
                  phone: phone || '',
                  gender: gender || '',
                },
                status: status?.toLowerCase() === 'inactive' ? 'inactive' : 'active',
                userId: createdUserId,
              });

              if (createdUserId) {
                await User.findByIdAndUpdate(createdUserId, { menteeId: String(newMentee._id) });
              }

              createdCount++;
            }
          } else if (job.type === 'ASSIGNMENTS') {
            const { resolvedMentorId, resolvedMenteeId, isReassignment } = rowItem.data;

            if (!resolvedMentorId || !resolvedMenteeId) {
              failedCount++;
              continue;
            }

            // Check if exact assignment already exists
            const existingSame = await Mentorship.findOne({
              mentorId: resolvedMentorId,
              menteeId: resolvedMenteeId,
            });

            if (existingSame) {
              if (existingSame.status !== 'active') {
                existingSame.status = 'active';
                await existingSame.save();
                updatedCount++;
              } else {
                skippedCount++;
              }
              continue;
            }

            // Check reassignment from another mentor
            if (isReassignment) {
              if (reassignMentees) {
                // Archive previous mentorship
                await Mentorship.updateMany(
                  { menteeId: resolvedMenteeId, status: 'active' },
                  { status: 'archived' },
                );

                await Mentorship.create({
                  mentorId: resolvedMentorId,
                  menteeId: resolvedMenteeId,
                  status: 'active',
                });
                updatedCount++;
              } else {
                skippedCount++;
              }
            } else {
              await Mentorship.create({
                mentorId: resolvedMentorId,
                menteeId: resolvedMenteeId,
                status: 'active',
              });
              createdCount++;
            }
          }
        } catch (rowError) {
          failedCount++;
          job.errors.push({
            row: rowItem.row,
            name: rowItem.data.name,
            email: rowItem.data.email,
            error: rowError instanceof Error ? rowError.message : 'Database insertion error',
          });
        }

        // Periodically update progress every 20 rows
        if ((createdCount + updatedCount + skippedCount + failedCount) % 20 === 0) {
          await ImportJob.findByIdAndUpdate(jobId, {
            createdCount,
            updatedCount,
            skippedCount,
            failedCount,
          });
        }
      }

      // Finalize job completion
      await ImportJob.findByIdAndUpdate(jobId, {
        status: 'COMPLETED',
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errors: job.errors,
        completedAt: new Date(),
      });
    } catch (fatalError) {
      await ImportJob.findByIdAndUpdate(jobId, {
        status: 'FAILED',
        completedAt: new Date(),
      });
    }
  });
}

/**
 * Generate Error CSV download
 */
export function generateErrorCsv(job: any): string {
  const headers = ['row', 'name', 'email', 'error'];
  const errorRows = (job.errors || [])
    .filter((e: any) => !e.warning)
    .map((e: any) => ({
      row: e.row,
      name: e.name || '',
      email: e.email || '',
      error: e.error || '',
    }));

  // If no fatal errors but warnings exist, include warnings with label
  if (errorRows.length === 0) {
    (job.errors || []).forEach((e: any) => {
      errorRows.push({
        row: e.row,
        name: e.name || '',
        email: e.email || '',
        error: `[Warning] ${e.error || ''}`,
      });
    });
  }

  return generateCsvString(headers, errorRows);
}

/**
 * Bulk Export service with formula injection protection
 */
export async function exportBulkData(
  category: 'mentors' | 'mentees' | 'assignments' | 'calls' | 'performance',
  filters: Record<string, string> = {},
): Promise<{ fileName: string; csvContent: string }> {
  const timestamp = new Date().toISOString().split('T')[0];

  if (category === 'mentors') {
    const query: Record<string, any> = {};
    if (filters.status && filters.status !== 'All') {
      query.status = filters.status.toLowerCase();
    }

    const mentors = await Mentor.find(query).lean();
    const userIds = mentors.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const rows = await Promise.all(
      mentors.map(async (m) => {
        const u = userMap.get(m.userId);
        const mentorId = String(m._id);
        const assignedMentees = await Mentorship.countDocuments({ mentorId, status: 'active' });
        const totalCalls = await Call.countDocuments({ mentorId });

        return {
          name: u?.name || 'Unknown',
          email: u?.email || '',
          phone: m.phone || '',
          gender: m.gender || '',
          status: m.status === 'active' ? 'Active' : 'Disabled',
          assignedMentees,
          totalCalls,
        };
      }),
    );

    const headers = ['name', 'email', 'phone', 'gender', 'status', 'assignedMentees', 'totalCalls'];
    return {
      fileName: `mentors_export_${timestamp}.csv`,
      csvContent: generateCsvString(headers, rows),
    };
  }

  if (category === 'mentees') {
    const query: Record<string, any> = {};
    if (filters.status && filters.status !== 'All') {
      query.status = filters.status.toLowerCase();
    }
    if (filters.standard && filters.standard !== 'All') {
      query.standard = filters.standard;
    }

    const mentees = await Mentee.find(query).sort({ standard: 1, name: 1 }).lean();
    const rows = await Promise.all(
      mentees.map(async (m) => {
        const menteeId = String(m._id);
        const assignment = await Mentorship.findOne({ menteeId, status: 'active' }).lean();
        let mentorName = 'Unassigned';
        if (assignment) {
          const mentor = await Mentor.findById(assignment.mentorId).lean();
          if (mentor) {
            const mentorUser = await User.findById(mentor.userId).lean();
            mentorName = mentorUser?.name || 'Unknown mentor';
          }
        }

        const contact = (m.contactInformation as Record<string, any>) || {};
        const totalCalls = await Call.countDocuments({ menteeId });

        return {
          name: m.name,
          email: contact.email || '',
          phone: contact.phone || '',
          standard: m.standard,
          gender: contact.gender || '',
          status: m.status === 'active' ? 'Active' : 'Inactive',
          assignedMentor: mentorName,
          totalCalls,
        };
      }),
    );

    const headers = ['name', 'email', 'phone', 'standard', 'gender', 'status', 'assignedMentor', 'totalCalls'];
    return {
      fileName: `mentees_export_${timestamp}.csv`,
      csvContent: generateCsvString(headers, rows),
    };
  }

  if (category === 'assignments') {
    const query: Record<string, any> = {};
    if (filters.status && filters.status !== 'All') {
      query.status = filters.status.toLowerCase();
    }

    const assignments = await Mentorship.find(query).sort({ assignedAt: -1 }).lean();
    const mentors = await Mentor.find().lean();
    const mentorMap = new Map(mentors.map((m) => [String(m._id), m]));
    const mentorUsers = await User.find({ _id: { $in: mentors.map((m) => m.userId) } }).lean();
    const userMap = new Map(mentorUsers.map((u) => [String(u._id), u]));

    const mentees = await Mentee.find().lean();
    const menteeMap = new Map(mentees.map((m) => [String(m._id), m]));

    const rows = assignments.map((a) => {
      const mentor = mentorMap.get(a.mentorId);
      const mentorUser = mentor ? userMap.get(mentor.userId) : null;
      const mentee = menteeMap.get(a.menteeId);
      const menteeContact = (mentee?.contactInformation as Record<string, any>) || {};

      return {
        mentor_name: mentorUser?.name || 'Unknown Mentor',
        mentor_email: mentorUser?.email || '',
        mentee_name: mentee?.name || 'Unknown Mentee',
        mentee_email: menteeContact.email || '',
        standard: mentee?.standard || '',
        status: a.status === 'active' ? 'Active' : 'Archived',
        assigned_date: a.assignedAt ? new Date(a.assignedAt).toISOString().split('T')[0] : '',
      };
    });

    const headers = ['mentor_name', 'mentor_email', 'mentee_name', 'mentee_email', 'standard', 'status', 'assigned_date'];
    return {
      fileName: `assignments_export_${timestamp}.csv`,
      csvContent: generateCsvString(headers, rows),
    };
  }

  if (category === 'calls') {
    const query: Record<string, any> = {};
    if (filters.status && filters.status !== 'All') {
      query.reviewStatus = filters.status;
    }

    const calls = await Call.find(query).sort({ date: -1 }).lean();
    const mentors = await Mentor.find().lean();
    const mentorMap = new Map(mentors.map((m) => [String(m._id), m]));
    const users = await User.find().lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const mentees = await Mentee.find().lean();
    const menteeMap = new Map(mentees.map((m) => [String(m._id), m]));

    const rows = calls.map((c) => {
      const mentor = mentorMap.get(c.mentorId);
      const mentorUser = mentor ? userMap.get(mentor.userId) : null;
      const mentee = menteeMap.get(c.menteeId);

      return {
        date: c.date ? new Date(c.date).toISOString().split('T')[0] : '',
        mentor_name: mentorUser?.name || 'Unknown',
        mentee_name: mentee?.name || 'Unknown',
        duration_minutes: c.duration || 0,
        review_status: c.reviewStatus || 'Draft',
        summary: (c.summary || '').replace(/\r?\n/g, ' '),
        topics: (c.topicsDiscussed || []).join('; '),
      };
    });

    const headers = ['date', 'mentor_name', 'mentee_name', 'duration_minutes', 'review_status', 'summary', 'topics'];
    return {
      fileName: `calls_export_${timestamp}.csv`,
      csvContent: generateCsvString(headers, rows),
    };
  }

  if (category === 'performance') {
    const query: Record<string, any> = {};
    if (filters.date) {
      query.date = filters.date;
    }

    const records = await DailyPerformance.find(query).sort({ date: -1 }).lean();
    const mentees = await Mentee.find().lean();
    const menteeMap = new Map(mentees.map((m) => [String(m._id), m]));

    const rows = records.map((p) => {
      const mentee = menteeMap.get(p.menteeId);
      return {
        date: p.date,
        mentee_name: mentee?.name || 'Unknown',
        standard: mentee?.standard || '',
        study_minutes: p.studyMinutes,
        quran_ruku: p.quran?.ruku || 0,
        quran_ayat: p.quran?.ayat || 0,
        quran_pages: p.quran?.pages || 0,
        reading_minutes: p.readingMinutes,
        day_rating: p.dayRating,
        daily_reflection: (p.dailyReflection || '').replace(/\r?\n/g, ' '),
        faced_difficulty: p.facedDifficulty ? 'Yes' : 'No',
        difficulty_note: (p.difficultyNote || '').replace(/\r?\n/g, ' '),
      };
    });

    const headers = [
      'date',
      'mentee_name',
      'standard',
      'study_minutes',
      'quran_ruku',
      'quran_ayat',
      'quran_pages',
      'reading_minutes',
      'day_rating',
      'daily_reflection',
      'faced_difficulty',
      'difficulty_note',
    ];

    return {
      fileName: `daily_performance_export_${timestamp}.csv`,
      csvContent: generateCsvString(headers, rows),
    };
  }

  throw new Error(`Unknown export category: ${category}`);
}
