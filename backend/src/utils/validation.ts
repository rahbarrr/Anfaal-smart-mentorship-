import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const callSubmissionSchema = z.object({
  mentorId: z.string().min(1),
  menteeId: z.string().min(1),
  date: z.string().or(z.date()),
  duration: z.number().min(1),
  mentorNotes: z.string().optional(),
});
