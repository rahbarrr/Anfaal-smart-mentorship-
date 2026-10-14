import type { Schema } from 'mongoose';

export type SoftDeleteFields = {
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
};

/** Excludes trashed documents from normal reads while allowing Bin queries to opt in. */
export function softDeletePlugin(schema: Schema) {
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: String },
    deletionReason: { type: String, maxlength: 500 },
  });

  schema.pre(/^find/, function softDeleteFilter(this: any, next: (error?: Error) => void) {
    const options = this.getOptions() as { includeDeleted?: boolean };
    if (!options.includeDeleted) this.where({ deletedAt: null });
    next();
  });
}
