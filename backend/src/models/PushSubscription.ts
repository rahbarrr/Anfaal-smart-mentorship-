import mongoose, { Schema } from 'mongoose';
import type { PushSubscriptionDocument } from '../types/index.js';

const pushSubscriptionSchema = new Schema<PushSubscriptionDocument>(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const PushSubscription = mongoose.model<PushSubscriptionDocument>(
  'PushSubscription',
  pushSubscriptionSchema,
);
