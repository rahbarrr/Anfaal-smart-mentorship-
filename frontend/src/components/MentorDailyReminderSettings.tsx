import { useState, useEffect } from 'react';
import {
  BellRing,
  Clock,
  CheckCircle2,
  AlertCircle,
  Globe,
  Sliders,
} from 'lucide-react';
import {
  getMentorReminderSettings,
  updateMentorReminderSettings,
  type ReminderSlot,
} from '../lib/api';

function formatTimeTo12Hour(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr.padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return h * 60 + m;
}

export function MentorDailyReminderSettings() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [timezone, setTimezone] = useState<string>('Asia/Kolkata');
  const [slots, setSlots] = useState<ReminderSlot[]>([
    { slotIndex: 1, time: '17:00', enabled: true },
    { slotIndex: 2, time: '19:00', enabled: true },
    { slotIndex: 3, time: '21:00', enabled: true },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getMentorReminderSettings()
      .then((res) => {
        if (!isMounted) return;
        if (res?.settings) {
          setEnabled(res.settings.enabled ?? true);
          setTimezone(res.settings.timezone || 'Asia/Kolkata');
          if (Array.isArray(res.settings.slots) && res.settings.slots.length > 0) {
            // Sort by slotIndex
            const sorted = [...res.settings.slots].sort((a, b) => a.slotIndex - b.slotIndex);
            setSlots(sorted);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not load reminder settings:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSlotToggle = (index: number) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)),
    );
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleTimeChange = (index: number, newTime: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, time: newTime } : s)),
    );
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const validate = (): string | null => {
    const enabledSlots = slots.filter((s) => s.enabled);
    if (enabled && enabledSlots.length === 0) {
      return 'Please enable at least one reminder slot, or turn off reminders entirely.';
    }

    // Chronological check
    for (let i = 0; i < enabledSlots.length - 1; i++) {
      const cur = enabledSlots[i];
      const next = enabledSlots[i + 1];
      const curM = timeToMinutes(cur.time);
      const nextM = timeToMinutes(next.time);

      if (curM === nextM) {
        return `Reminder slot ${cur.slotIndex} and slot ${next.slotIndex} cannot have the same time (${formatTimeTo12Hour(cur.time)}).`;
      }
      if (nextM <= curM) {
        return `Reminder slot ${next.slotIndex} (${formatTimeTo12Hour(next.time)}) must be later than Reminder slot ${cur.slotIndex} (${formatTimeTo12Hour(cur.time)}).`;
      }
    }
    return null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const validationErr = validate();
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateMentorReminderSettings({
        enabled,
        timezone,
        slots,
      });
      setSuccessMessage(res.message || 'Daily progress reminder settings saved.');
      if (res.settings) {
        setEnabled(res.settings.enabled);
        setTimezone(res.settings.timezone);
        setSlots(res.settings.slots);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to save reminder settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="summary-card" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading reminder settings…</div>
      </div>
    );
  }

  return (
    <div className="summary-card" style={{ marginBottom: 20 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 14,
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(143,63,102,0.1)',
              color: 'var(--primary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <BellRing size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Daily Progress Reminders
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Send automatic push notifications to mentees with pending daily responses
            </p>
          </div>
        </div>

        {/* Master ON/OFF Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: enabled ? 'var(--primary)' : 'var(--text-secondary)' }}>
            {enabled ? 'Reminders Active' : 'Reminders Paused'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => {
              setEnabled(!enabled);
              setSuccessMessage(null);
              setErrorMessage(null);
            }}
            style={{
              width: 48,
              height: 26,
              borderRadius: 999,
              background: enabled ? 'var(--primary)' : 'var(--border)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              padding: 2,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 2,
                left: enabled ? 24 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Success Alert */}
        {successMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(46, 139, 87, 0.1)',
              border: '1px solid rgba(46, 139, 87, 0.25)',
              color: '#2e7d32',
              fontSize: '0.88rem',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={18} flex-shrink={0} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(199, 92, 92, 0.1)',
              border: '1px solid rgba(199, 92, 92, 0.25)',
              color: 'var(--danger)',
              fontSize: '0.88rem',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={18} flex-shrink={0} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Slots List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {slots.map((slot, index) => {
            const isSlotActive = enabled && slot.enabled;
            return (
              <div
                key={slot.slotIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: isSlotActive ? 'rgba(143,63,102,0.04)' : 'var(--surface-muted)',
                  border: isSlotActive ? '1px solid rgba(143,63,102,0.18)' : '1px solid var(--border)',
                  opacity: enabled ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {/* Slot Info & Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 160 }}>
                  <input
                    type="checkbox"
                    id={`slot-check-${slot.slotIndex}`}
                    checked={slot.enabled}
                    disabled={!enabled}
                    onChange={() => handleSlotToggle(index)}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <label
                    htmlFor={`slot-check-${slot.slotIndex}`}
                    style={{
                      cursor: enabled ? 'pointer' : 'default',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      color: slot.enabled ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    Reminder {slot.slotIndex}
                  </label>
                </div>

                {/* Slot Time Picker & 12-Hour Display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color="var(--primary)" />
                    <input
                      type="time"
                      value={slot.time}
                      disabled={!enabled || !slot.enabled}
                      onChange={(e) => handleTimeChange(index, e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        fontWeight: 600,
                        fontSize: '0.88rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      minWidth: 78,
                      textAlign: 'right',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: slot.enabled && enabled ? 'var(--primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {slot.enabled ? formatTimeTo12Hour(slot.time) : 'Disabled'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Timezone & Rules Note */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(143,63,102,0.04)',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Globe size={15} color="var(--primary)" />
            <span>Schedule Timezone:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{timezone} (IST)</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={14} />
            <span>Reminders automatically stop once a mentee submits today.</span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="btn-primary"
          disabled={isSaving}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 12,
            fontSize: '0.92rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isSaving ? 'Saving Changes…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
