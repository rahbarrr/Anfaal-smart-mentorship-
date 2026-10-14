/**
 * Date and Time utilities for Anfaal Smart Mentorship platform.
 * Formats timestamps server-generated in UTC to human-friendly local representations.
 *
 * Rules:
 * - Today: "Today • 4:37 PM"
 * - Yesterday: "Yesterday • 4:37 PM"
 * - Older: "03 Oct 2026 • 4:37 PM"
 */

export function parseValidDate(input: string | Date | undefined | null): Date | null {
  if (!input) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateOnly(input: string | Date | undefined | null): string {
  const d = parseValidDate(input);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeOnly(input: string | Date | undefined | null): string {
  const d = parseValidDate(input);
  if (!d) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(input: string | Date | undefined | null): string {
  const d = parseValidDate(input);
  if (!d) return '—';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) {
    return `Today • ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Yesterday • ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return `${dateStr} • ${timeStr}`;
}

/**
 * Returns human-friendly text for submittedAt and optional updatedAt
 * If updatedAt is within 15 seconds of submittedAt (or createdAt), it is considered
 * initial creation and not an edit.
 */
export function formatSubmissionTimestamps(
  submittedAtInput?: string | Date | null,
  updatedAtInput?: string | Date | null,
): {
  submittedFormatted: string;
  submittedTimeOnly: string;
  updatedFormatted: string | null;
  updatedTimeOnly: string | null;
  isEdited: boolean;
} {
  const subDate = parseValidDate(submittedAtInput);
  const upDate = parseValidDate(updatedAtInput);

  const submittedFormatted = subDate ? formatDateTime(subDate) : '—';
  const submittedTimeOnly = subDate ? formatTimeOnly(subDate) : '—';

  let isEdited = false;
  let updatedFormatted: string | null = null;
  let updatedTimeOnly: string | null = null;

  if (subDate && upDate) {
    // If updatedAt is more than 30 seconds after submittedAt, it's a genuine edit
    const diffMs = upDate.getTime() - subDate.getTime();
    if (diffMs > 30000) {
      isEdited = true;
      updatedFormatted = formatDateTime(upDate);
      updatedTimeOnly = formatTimeOnly(upDate);
    }
  }

  return {
    submittedFormatted,
    submittedTimeOnly,
    updatedFormatted,
    updatedTimeOnly,
    isEdited,
  };
}

export function formatRelativeTime(input: string | Date | undefined | null): string {
  const d = parseValidDate(input);
  if (!d) return '—';

  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);

  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1 min ago';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 7200) return '1 hour ago';
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < 172800) return 'yesterday';
  return `${Math.floor(diffSec / 86400)} days ago`;
}
