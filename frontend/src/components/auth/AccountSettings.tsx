import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Panel, Field, inputClass, buttonClass, FormModal } from '../common/FormPanel';

export const AccountSettings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.full_name || '');
  const [weight, setWeight] = useState(user?.weight_kg?.toString() || '');
  const [height, setHeight] = useState(user?.height_cm?.toString() || '');
  const [side, setSide] = useState(user?.side_preference || '');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (err: any) { setError(err.message); } finally { setBusy(false); } };
  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-6"><h2 className="text-2xl font-extrabold text-white">Account settings</h2><p className="text-sm text-slate-400">{user?.email}</p>{error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-rose-200">{error}</p>}{message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-emerald-200">{message}</p>}
    <Panel title="Your profile"><form onSubmit={(event) => { event.preventDefault(); run(async () => { await api.updateProfile({ full_name: name, weight_kg: weight ? Number(weight) : null, height_cm: height ? Number(height) : null, side_preference: side || null }); await refreshUser(); setMessage('Profile saved.'); }); }} className="space-y-4">
      <Field label="Full name"><input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Weight (kg), optional"><input type="number" min="1" step="any" value={weight} onChange={(event) => setWeight(event.target.value)} className={inputClass} /></Field><Field label="Height (cm), optional"><input type="number" min="1" step="any" value={height} onChange={(event) => setHeight(event.target.value)} className={inputClass} /></Field></div>
      <Field label="Rowing side"><select value={side} onChange={(event) => setSide(event.target.value as typeof side)} className={inputClass}><option value="">Not set</option>{['port', 'starboard', 'both', 'scull'].map((value) => <option key={value}>{value}</option>)}</select></Field><button disabled={busy} className={buttonClass}>Save profile</button>
    </form></Panel>
    <Panel title="Change password"><form onSubmit={(event) => { event.preventDefault(); run(async () => { await api.changePassword(password, nextPassword); setPassword(''); setNextPassword(''); setMessage('Password changed. Other sessions have been signed out.'); }); }} className="space-y-4">
      <Field label="Current password"><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></Field><Field label="New password (8–72 characters)"><input type="password" required autoComplete="new-password" minLength={8} maxLength={72} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className={inputClass} /></Field><button disabled={busy} className={buttonClass}>Change password</button>
    </form></Panel>
    <Panel title="Change email"><p className="text-xs text-slate-400">Your existing address stays active until you confirm the link delivered to your new address.</p><form onSubmit={(event) => { event.preventDefault(); run(async () => { const result = await api.changeEmail(emailPassword, email); setEmailPassword(''); setMessage(result.message); }); }} className="space-y-4"><Field label="New email address"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></Field><Field label="Current password"><input type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className={inputClass} /></Field><button disabled={busy} className={buttonClass}>Send confirmation link</button></form></Panel>
  </div>;
};

export const AccountRecovery: React.FC<{ action?: string; token?: string; onClose: () => void }> = ({ action, token, onClose }) => {
  const { logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <FormModal title={action === 'email_change' ? 'Confirm your email' : token ? 'Choose a new password' : 'Reset your password'} onClose={onClose}>
    {message ? <div className="space-y-4"><p role="status" className="text-sm text-emerald-200">{message}</p><button type="button" onClick={onClose} className={buttonClass}>Return to sign in</button></div> : <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('');
      try { const result = token ? await api.confirmAccountAction(token, action === 'password_reset' ? password : undefined) : await api.forgotPassword(email); if (token) logout(); setMessage(result.message); }
      catch (err: any) { setError(err.message); } finally { setBusy(false); }
    }}>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {!token && <Field label="Your account email"><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></Field>}
      {token && action === 'password_reset' && <Field label="New password"><input type="password" required autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></Field>}
      {action === 'email_change' && <p className="text-sm text-slate-300">Confirm this email change to update your sign-in address. You will then sign in again.</p>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Please wait…' : token ? 'Confirm update' : 'Send reset link'}</button>
    </form>}
  </FormModal>;
};
