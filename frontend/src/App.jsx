import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardList, Download, FileText,
  LayoutDashboard, LogOut, Menu, Search, ShieldCheck, UploadCloud, Users, X
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const labels = { draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', rejected: 'Corrections requested' };
const roleLabels = { vendor: 'Vendor workspace', reviewer: 'Reviewer workspace', admin: 'Admin workspace' };

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const csrf = document.cookie.split('; ').find((item) => item.startsWith('edvexa_csrf='))?.split('=')[1];
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (!['GET', 'HEAD'].includes(method) && csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
  const response = await fetch(`${API_URL}${path}`, { ...options, method, headers, credentials: 'include' });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || 'The request could not be completed.');
    error.code = body.error?.code;
    error.status = response.status;
    throw error;
  }
  return body.data;
}

async function downloadPrivateDocument(path, fileName) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || 'The document could not be downloaded.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function useRequest(request, dependencies = []) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const run = useCallback(async () => {
    setState({ loading: true, error: '', data: null });
    try { setState({ loading: false, error: '', data: await request() }); }
    catch (error) { setState({ loading: false, error: error.message, data: null }); }
  }, dependencies);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => { api('/auth/me').then((data) => setUser(data.user)).catch(() => { }).finally(() => setAuthLoading(false)); }, []);
  if (authLoading) return <ScreenState loading />;
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={() => { api('/auth/logout', { method: 'POST' }).finally(() => setUser(null)); }} />;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await api(`/auth/${mode === 'signup' ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onLogin(data.user);
    }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const signup = mode === 'signup';
  return <div className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white"><ShieldCheck /></div><div><p className="text-lg font-bold">edvexa</p><p className="text-xs text-muted">Vendor verification platform</p></div></div><h1 className="mt-10 text-2xl font-bold">{signup ? 'Create your vendor account' : 'Welcome back'}</h1><p className="mt-2 text-sm text-muted">{signup ? 'Start your secure vendor onboarding application.' : 'Sign in to continue to your workspace.'}</p>{error && <InlineError message={error} />}{signup && <label className="mt-7 block text-sm font-medium">Full name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input mt-2" /></label>}<label className={`${signup ? 'mt-4' : 'mt-7'} block text-sm font-medium`}>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input mt-2" /></label><label className="mt-4 block text-sm font-medium">Password<input required minLength={12} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input mt-2" /><span className="mt-1 block text-xs text-muted">Use at least 12 characters.</span></label><button disabled={busy} className="button-primary mt-6 w-full">{busy ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create vendor account' : 'Sign in')}</button><button type="button" disabled={busy} onClick={() => { setMode(signup ? 'login' : 'signup'); setError(''); }} className="mt-4 w-full text-sm font-semibold text-brand hover:underline">{signup ? 'Already have an account? Sign in' : 'New vendor? Create an account'}</button></form></div>;
}

function Workspace({ user, onLogout }) {
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState('overview');
  return <div className="min-h-screen bg-canvas text-ink"><aside className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-white px-5 py-6 transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white"><ShieldCheck size={21} /></div><div><p className="font-bold">edvexa</p><p className="text-xs text-muted">Vendor operations</p></div></div><button className="lg:hidden" onClick={() => setMenu(false)} aria-label="Close navigation"><X size={20} /></button></div><nav className="mt-10 space-y-1" aria-label="Primary navigation"><NavButton icon={LayoutDashboard} label="Overview" active={view === 'overview'} onClick={() => { setView('overview'); setMenu(false); }} /><NavButton icon={ClipboardList} label={user.role === 'vendor' ? 'My application' : 'Application queue'} active={view === 'applications'} onClick={() => { setView('applications'); setMenu(false); }} />{user.role === 'admin' && <NavButton icon={Users} label="Users & roles" onClick={() => { setView('users'); setMenu(false); }} />}</nav><div className="absolute bottom-6 left-5 right-5 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold">Signed in as</p><p className="mt-1 truncate text-sm text-muted">{user.email}</p><button onClick={onLogout} className="mt-3 flex items-center gap-2 text-xs font-semibold text-rose-600"><LogOut size={14} /> Sign out</button></div></aside>{menu && <button className="fixed inset-0 z-20 bg-slate-900/20 lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu overlay" />}<main className="lg:pl-72"><header className="flex h-20 items-center border-b border-slate-200 bg-white px-5 sm:px-8"><button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation"><Menu /></button><div className="ml-4 sm:ml-0"><p className="text-xs font-semibold uppercase tracking-widest text-brand">{roleLabels[user.role]}</p><p className="text-sm text-muted">Secure workspace</p></div><div className="ml-auto flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-sm font-bold text-brand">{user.name.slice(0, 2).toUpperCase()}</div><div className="hidden sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs capitalize text-muted">{user.role}</p></div></div></header><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{view === 'overview' ? <Overview user={user} onOpen={() => setView('applications')} /> : view === 'applications' ? <Applications user={user} /> : <AdminUsers />}</div></main></div>;
}

function NavButton({ icon: Icon, label, active, onClick }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${active ? 'bg-blue-50 text-brand' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18} />{label}</button>; }

function Overview({ user, onOpen }) {
  if (user.role === 'vendor') return <VendorOverview onOpen={onOpen} />;
  const endpoint = user.role === 'admin' ? '/admin/dashboard/summary' : '/reviews';
  const state = useRequest(() => api(endpoint), [endpoint]);
  if (state.loading) return <ScreenState loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  const data = user.role === 'admin' ? state.data : { pending: state.data.pagination?.total ?? state.data.applications?.length ?? 0 };
  const cards = user.role === 'admin' ? [['Total applications', data.total, 'All submitted work'], ['Pending reviews', data.pending, 'Needs attention'], ['Approved', data.approved, 'Completed decisions'], ['Rejected', data.rejected, 'Awaiting corrections']] : [['Review queue', data.pending, 'Assigned or available'], ['Assigned to you', state.data.applications?.filter((item) => item.assignedReviewerId?._id === user.id).length ?? 0, 'Your active reviews']];
  return <><PageHeader eyebrow={roleLabels[user.role]} title={user.role === 'admin' ? 'Operations overview' : 'Your review queue'} description="Stay on top of verification work with live authorized data." action={<button onClick={onOpen} className="button-primary">Open applications</button>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, hint]) => <Metric key={label} label={label} value={value} hint={hint} />)}</div>{user.role === 'admin' && <section className="panel mt-6"><div><h2 className="font-semibold">Submission trend</h2><p className="mt-1 text-sm text-muted">Daily submissions returned by the API</p></div><div className="mt-8 flex h-48 items-end gap-2">{(data.trend || []).map((point) => <div key={point._id} className="group flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-md bg-blue-200 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(point.count * 18, 8)}%` }} title={`${point._id}: ${point.count}`} /><span className="text-[10px] text-muted">{point._id.slice(5)}</span></div>)}</div></section>}</>;
}

function VendorOverview({ onOpen }) {
  const profile = useRequest(() => api('/vendor/profile'), []);
  const documents = useRequest(() => api('/vendor/documents'), []);
  if (profile.loading || documents.loading) return <ScreenState loading />;
  if (profile.error || documents.error) return <ErrorState message={profile.error || documents.error} onRetry={() => { profile.reload(); documents.reload(); }} />;
  const item = profile.data.profile; const docs = documents.data.documents || []; const missing = ['registration_certificate', 'identity_document'].filter((required) => !docs.some((doc) => doc.requirement === required));
  return <><PageHeader eyebrow="Vendor workspace" title={item.businessName || 'Complete your application'} description="Track your verification progress and respond to reviewer feedback." action={<button onClick={onOpen} className="button-primary">{item.status === 'draft' ? 'Continue application' : 'View application'}</button>} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Current status" value={labels[item.status]} hint="Application lifecycle" /><Metric label="Documents" value={`${docs.length}/2`} hint={missing.length ? `${missing.length} missing` : 'All required files'} /><Metric label="Next step" value={item.status === 'rejected' ? 'Make corrections' : item.status === 'approved' ? 'Complete' : 'Review'} hint={item.decisionReason || 'We will notify you of updates'} /></div>{missing.length > 0 && <section className="panel mt-6 border-amber-200 bg-amber-50"><h2 className="font-semibold text-amber-950">Missing documents</h2><div className="mt-3 flex flex-wrap gap-2">{missing.map((name) => <span key={name} className="badge bg-white text-amber-800">{name.replaceAll('_', ' ')}</span>)}</div></section>}<section className="panel mt-6"><h2 className="font-semibold">Reviewer feedback</h2>{item.decisionReason ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.decisionReason}</p> : <EmptyState title="No feedback yet" message="Reviewer comments will appear here." />}</section></>;
}

function Applications({ user }) {
  if (user.role === 'vendor') return <VendorApplication />;
  return <Queue user={user} />;
}

function VendorApplication() {
  const profile = useRequest(() => api('/vendor/profile'), []);
  const profileId = profile.data?.profile?._id;
  const details = useRequest(() => profileId ? api(`/vendor/applications/${profileId}`) : Promise.resolve(null), [profileId]);
  const [busy, setBusy] = useState(false);
  if (profile.loading || (profile.data && details.loading)) return <ScreenState loading />;
  if (profile.error) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  const item = details.data?.profile || profile.data.profile;
  async function submit() { setBusy(true); try { await api('/vendor/submit', { method: 'POST' }); details.reload(); } catch (error) { window.alert(error.message); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="My application" title={item.businessName || 'Application draft'} description="Update your details and upload the documents required for verification." /><ApplicationDetail profile={item} documents={details.data?.documents || []} audit={details.data?.audit || []} /><DocumentUploader disabled={!['draft', 'rejected'].includes(item.status)} onUploaded={details.reload} /><div className="mt-6 flex justify-end"><button onClick={submit} disabled={busy || !['draft', 'rejected'].includes(item.status)} className="button-primary">{busy ? 'Submitting…' : item.status === 'rejected' ? 'Resubmit corrections' : 'Submit application'}</button></div></>;
}

function DocumentUploader({ disabled, onUploaded }) {
  const [requirement, setRequirement] = useState('registration_certificate');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(event) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setMessage('');
    try { const body = new FormData(); body.append('requirement', requirement); body.append('file', file); await api('/vendor/documents', { method: 'POST', body }); setMessage('Document uploaded. Processing will continue in the background.'); setFile(null); event.target.reset(); onUploaded(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <form onSubmit={upload} className="panel mt-6"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-brand"><FileText size={17} /></div><div><h2 className="font-semibold">Upload or replace a document</h2><p className="text-xs text-muted">PDF, JPEG, or PNG up to 10 MB.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr_auto]"><label className="sr-only" htmlFor="requirement">Document type</label><select id="requirement" disabled={disabled || busy} value={requirement} onChange={(e) => setRequirement(e.target.value)} className="input"><option value="registration_certificate">Registration certificate</option><option value="identity_document">Identity document</option></select><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-muted"><UploadCloud size={18} /><span className="truncate">{file?.name || 'Choose a file'}</span><input disabled={disabled || busy} required type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} className="sr-only" /></label><button disabled={disabled || busy || !file} className="button-primary">{busy ? 'Uploading…' : 'Upload'}</button></div>{message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}</form>;
}

function Queue({ user }) {
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [selected, setSelected] = useState(null);
  const endpoint = user.role === 'admin' ? '/admin/applications' : '/reviews';
  const state = useRequest(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''));
    return api(`${endpoint}?${params}`);
  }, [endpoint, filters.search, filters.status, filters.page]);
  const detail = useRequest(() => selected ? api(`${user.role === 'admin' ? '/admin/applications/' : '/reviews/'}${selected}`) : Promise.resolve(null), [selected, user.role]);
  return <>{selected ? <><button onClick={() => setSelected(null)} className="mb-6 flex items-center gap-2 text-sm font-semibold text-brand"><ArrowLeft size={16} /> Back to queue</button>{detail.loading ? <ScreenState loading /> : detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : !detail.data ? <ErrorState message="The application details were not returned. Please try again." /> : <ReviewerDetail data={detail.data} user={user} onDone={() => { setSelected(null); state.reload(); }} />}</> : <><PageHeader eyebrow={user.role === 'admin' ? 'Admin applications' : 'Review queue'} title="Applications" description="Search and filter the authorized application queue." /><div className="panel mb-5"><div className="grid gap-3 md:grid-cols-[1fr_180px]"><label className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input aria-label="Search applications" placeholder="Search vendor or registration number" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} className="input pl-10" /></label><select aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} className="input"><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>{state.loading ? <ScreenState loading /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : <ApplicationTable applications={state.data?.applications || []} onSelect={setSelected} />}{state.data?.pagination && <Pagination pagination={state.data.pagination} onChange={(page) => setFilters({ ...filters, page })} />}</>}</>;
}

function ApplicationTable({ applications = [], onSelect }) { return <section className="panel overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted"><tr><th className="px-6 py-4">Vendor</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Submitted</th><th className="px-6 py-4">Reviewer</th><th className="px-6 py-4" /></tr></thead><tbody>{applications.map((item) => <tr key={item._id} className="border-t border-slate-100"><td className="px-6 py-4"><p className="font-semibold">{item.businessName || 'Unnamed vendor'}</p><p className="text-xs text-muted">{item.ownerUserId?.email || item.registrationNumber}</p></td><td className="px-6 py-4"><Status value={item.status} /></td><td className="px-6 py-4 text-muted">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : '—'}</td><td className="px-6 py-4 text-muted">{item.assignedReviewerId?.name || 'Unassigned'}</td><td className="px-6 py-4 text-right"><button onClick={() => onSelect(item._id)} className="text-xs font-semibold text-brand">View details</button></td></tr>)}</tbody></table>{!applications.length && <EmptyState title="No applications found" message="Try adjusting your search or filters." />}</div></section>; }

function ReviewerDetail({ data, user, onDone }) { const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); if (!data?.profile) return <ErrorState message="The application details were not returned. Please try again." />; const profile = data.profile; const reviewBase = user.role === 'admin' ? `/admin/applications/${profile._id}` : `/reviews/${profile._id}`; async function action(path) { if (reason.trim().length < 3) return; setBusy(true); try { await api(`${reviewBase}/${path}`, { method: 'POST', body: JSON.stringify({ reason }) }); onDone(); } catch (error) { window.alert(error.message); } finally { setBusy(false); } } return <><PageHeader eyebrow="Application detail" title={profile.businessName || 'Vendor application'} description={`Registration ${profile.registrationNumber || 'not provided'}`} /><ApplicationDetail profile={profile} documents={data.documents} audit={data.audit} documentBase={`${reviewBase}/documents`} />{user.role === 'reviewer' && <section className="panel mt-6"><h2 className="font-semibold">{profile.status === 'submitted' ? 'Claim this review' : 'Decision'}</h2>{profile.status === 'submitted' && <button disabled={busy} onClick={async () => { setBusy(true); try { await api(`${reviewBase}/claim`, { method: 'POST' }); onDone(); } catch (error) { window.alert(error.message); } finally { setBusy(false); } }} className="button-primary mt-4">Claim application</button>}{profile.status === 'under_review' && <><label className="mt-4 block text-sm font-medium">Decision comments<textarea required minLength="3" value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-2 min-h-28" placeholder="Explain the decision for the vendor." /></label><div className="mt-4 flex gap-3"><button disabled={busy || reason.trim().length < 3} onClick={() => action('approve')} className="button-success"><Check size={16} /> Approve</button><button disabled={busy || reason.trim().length < 3} onClick={() => action('reject')} className="button-danger">Request corrections</button></div></>}</section>}</>; }

function ApplicationDetail({ profile, documents, audit, documentBase = '/vendor/documents' }) {
  const [downloadError, setDownloadError] = useState('');
  async function download(document) {
    setDownloadError('');
    try { await downloadPrivateDocument(`${documentBase}/${document._id}`, document.originalFileName); }
    catch (error) { setDownloadError(error.message); }
  }
  return <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><section className="space-y-6"><div className="panel"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-widest text-muted">Current status</p><div className="mt-2 flex items-center gap-3"><Status value={profile.status} /><span className="text-sm text-muted">{profile.submittedAt ? `Submitted ${new Date(profile.submittedAt).toLocaleDateString()}` : 'Not submitted'}</span></div></div><FileText className="text-blue-200" size={28} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Info label="Business name" value={profile.businessName} /><Info label="Registration number" value={profile.registrationNumber} /><Info label="Business type" value={profile.businessType?.replaceAll('_', ' ')} /><Info label="Contact" value={profile.contact?.email} /><Info label="Address" value={[profile.address?.line1, profile.address?.city, profile.address?.country].filter(Boolean).join(', ')} /></div></div><div className="panel"><h2 className="font-semibold">Documents</h2>{downloadError && <InlineError message={downloadError} />}<div className="mt-4 space-y-3">{documents?.length ? documents.map((doc) => <div key={doc._id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-brand"><FileText size={17} /></div><div><p className="text-sm font-medium">{doc.requirement.replaceAll('_', ' ')}</p><p className="text-xs text-muted">{doc.originalFileName} · {Math.round(doc.sizeBytes / 1024)} KB</p></div></div><button type="button" onClick={() => download(doc)} className="rounded-lg p-2 text-brand hover:bg-blue-50" aria-label={`Download ${doc.originalFileName}`}><Download size={17} /></button></div>) : <EmptyState title="No documents uploaded" message="Required documents will appear here." />}</div></div></section><AuditTimeline audit={audit} /></div>;
}

function AuditTimeline({ audit = [] }) { return <section className="panel"><h2 className="font-semibold">Audit history</h2>{audit.length ? <div className="mt-5 space-y-5">{audit.map((entry) => <div key={entry._id} className="relative pl-6 before:absolute before:left-1 before:top-2 before:h-2 before:w-2 before:rounded-full before:bg-brand"><p className="text-sm font-semibold">{labels[entry.newStatus] || entry.newStatus}</p><p className="mt-1 text-xs text-muted">{new Date(entry.createdAt).toLocaleString()} · {entry.actorRole}</p>{entry.decisionReason && <p className="mt-2 text-sm text-slate-600">{entry.decisionReason}</p>}</div>)}</div> : <EmptyState title="No history yet" message="Lifecycle events will appear here." />}</section>; }

function AdminUsers() {
  const [users, setUsers] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [form, setForm] = useState({ name: '', email: '', role: 'reviewer', temporaryPassword: '' });
  const reload = () => api('/admin/users').then((data) => setUsers(data.users || [])).catch((err) => setError(err.message));
  useEffect(() => { reload(); }, []);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await api('/admin/users', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', email: '', role: 'reviewer', temporaryPassword: '' }); await reload(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Admin workspace" title="Users & roles" description="Provision reviewers and administrators through a controlled workflow." />{error && <InlineError message={error} />}<div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><form onSubmit={submit} className="panel"><h2 className="font-semibold">Provision user</h2><p className="mt-1 text-sm text-muted">Temporary passwords must be at least 16 characters.</p><label className="mt-5 block text-sm font-medium">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input mt-2" /></label><label className="mt-4 block text-sm font-medium">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input mt-2" /></label><label className="mt-4 block text-sm font-medium">Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input mt-2"><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select></label><label className="mt-4 block text-sm font-medium">Temporary password<input required minLength={16} type="password" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} className="input mt-2" /></label><button disabled={busy} className="button-primary mt-5 w-full">{busy ? 'Provisioning…' : 'Provision user'}</button></form><section className="panel"><h2 className="font-semibold">Directory</h2>{users.length ? <div className="mt-4 divide-y divide-slate-100">{users.map((item) => <div key={item._id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted">{item.email}</p></div><span className="badge bg-blue-50 text-brand">{item.role}</span></div>)}</div> : <div className="mt-4"><EmptyState title="No users found" message="Provision the first reviewer or administrator." /></div>}</section></div></>;
}
function Metric({ label, value, hint }) { return <div className="panel"><p className="text-sm text-muted">{label}</p><p className="mt-4 text-3xl font-bold">{value ?? '—'}</p><p className="mt-2 text-xs text-muted">{hint}</p></div>; }
function Info({ label, value }) { return <div><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-medium capitalize">{value || 'Not provided'}</p></div>; }
function Status({ value }) { const colors = { draft: 'bg-slate-100 text-slate-700', submitted: 'bg-blue-50 text-blue-700', under_review: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700' }; return <span className={`badge ${colors[value] || colors.draft}`}>{labels[value] || value}</span>; }
function PageHeader({ eyebrow, title, description, action }) { return <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-brand">{eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm text-muted">{description}</p></div>{action}</div>; }
function Pagination({ pagination, onChange }) { return <div className="mt-5 flex items-center justify-between text-sm text-muted"><span>Page {pagination.page} of {Math.max(pagination.pages, 1)}</span><div className="flex gap-2"><button disabled={pagination.page <= 1} onClick={() => onChange(pagination.page - 1)} className="icon-button" aria-label="Previous page"><ChevronLeft size={17} /></button><button disabled={pagination.page >= pagination.pages} onClick={() => onChange(pagination.page + 1)} className="icon-button" aria-label="Next page"><ChevronRight size={17} /></button></div></div>; }
function ScreenState({ loading }) { return <div className="grid min-h-[280px] place-items-center">{loading ? <div className="space-y-3 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" /><p className="text-sm text-muted">Loading secure data…</p></div> : null}</div>; }
function ErrorState({ message, onRetry }) { return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-8 text-center"><AlertCircle className="mx-auto text-rose-500" /><h2 className="mt-3 font-semibold text-rose-950">Something went wrong</h2><p className="mt-2 text-sm text-rose-700">{message}</p>{onRetry && <button onClick={onRetry} className="button-danger mt-5">Try again</button>}</div>; }
function InlineError({ message }) { return <div role="alert" className="mt-5 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{message}</div>; }
function EmptyState({ title, message }) { return <div className="py-10 text-center"><p className="font-semibold text-slate-700">{title}</p><p className="mt-1 text-sm text-muted">{message}</p></div>; }
