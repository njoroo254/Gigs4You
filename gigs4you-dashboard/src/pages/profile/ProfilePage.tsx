import { useEffect, useState } from 'react'
import { Save, Plus, X, Camera, Star, Briefcase, GraduationCap,
         Award, Globe, Phone, Mail, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/store'
import { getSkills, getMyWorkerProfile, createSkill, api, getSystemOptions, addSystemOption } from '../../api/api'

const COUNTIES = ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika',
  'Machakos','Meru','Nyeri','Kisii','Kakamega','Embu','Other']
const LANG_OPTIONS = ['English','Kiswahili','Kikuyu','Luo','Kamba','Kalenjin','Luhya','Other']

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [tab, setTab]             = useState<'bio'|'cv'|'skills'|'rates'>('bio')
  const [profile, setProfile]     = useState<any>(null)
  const [skills, setSkills]       = useState<any[]>([])
  const [mySkillIds, setMySkillIds] = useState<string[]>([])
  const [saving, setSaving]       = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [otherSkill, setOtherSkill]   = useState('')
  const [addingOther, setAddingOther] = useState(false)
  const [expandedExp, setExpandedExp] = useState<number | null>(null)

  const [customCounties, setCustomCounties]   = useState<string[]>([])
  const [customLanguages, setCustomLanguages] = useState<string[]>([])
  const [otherCounty, setOtherCounty]         = useState('')
  const [otherLang, setOtherLang]             = useState('')
  const [addingOtherLang, setAddingOtherLang] = useState(false)

  const [bio, setBio] = useState({
    bio:'', location:'', county:'', dateOfBirth:'',
    nationalIdNumber:'', linkedinUrl:'', languages:[] as string[],
  })
  const [rates, setRates] = useState({
    dailyRate:'', hourlyRate:'', mpesaPhone:'',
    isAvailable:true, availabilityNote:'',
  })
  const [workExp, setWorkExp]   = useState<any[]>([])
  const [education, setEd]      = useState<any[]>([])
  const [certs, setCerts]       = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      getMyWorkerProfile().catch(() => null),
      getSkills().catch(() => []),
    ]).then(([p, s]) => {
      if (p) {
        setProfile(p)
        setBio({
          bio:               p.bio || '',
          location:          p.location || '',
          county:            p.county || '',
          dateOfBirth:       p.dateOfBirth || '',
          nationalIdNumber:  p.nationalIdNumber || '',
          linkedinUrl:       p.linkedinUrl || '',
          languages:         p.languages || [],
        })
        setRates({
          dailyRate:         p.dailyRate?.toString() || '',
          hourlyRate:        p.hourlyRate?.toString() || '',
          mpesaPhone:        p.mpesaPhone || '',
          isAvailable:       p.isAvailable !== false,
          availabilityNote:  p.availabilityNote || '',
        })
        setWorkExp(p.workExperience || [])
        setEd(p.education || [])
        setCerts(p.certifications || [])
        setMySkillIds((p.skills || []).map((s: any) => s.id))
      }
      setSkills(Array.isArray(s) ? s : [])
    })
  }, [])

  useEffect(() => {
    getSystemOptions('county').then(setCustomCounties).catch(() => {})
    getSystemOptions('language').then(setCustomLanguages).catch(() => {})
  }, [])

  const allCounties  = [...COUNTIES.filter(c => c !== 'Other'),    ...customCounties.filter(c => !COUNTIES.includes(c)),     'Other']
  const allLanguages = [...LANG_OPTIONS.filter(l => l !== 'Other'), ...customLanguages.filter(l => !LANG_OPTIONS.includes(l)), 'Other']

  const addCustomLanguage = async () => {
    const v = otherLang.trim()
    if (!v) return
    setBio(b => ({ ...b, languages: b.languages.includes(v) ? b.languages : [...b.languages, v] }))
    if (!customLanguages.includes(v)) setCustomLanguages(prev => [...prev, v])
    setAddingOtherLang(false)
    setOtherLang('')
    try { await addSystemOption('language', v) } catch {}
  }

  const saveProfile = async () => {
    if (bio.county === 'Other' && !otherCounty.trim()) return toast.error('Please specify your county')
    const resolvedCounty = bio.county === 'Other' ? otherCounty.trim() : bio.county
    setSaving(true)
    try {
      if (bio.county === 'Other' && otherCounty.trim()) {
        await addSystemOption('county', otherCounty.trim()).catch(() => {})
        setCustomCounties(prev => prev.includes(otherCounty.trim()) ? prev : [...prev, otherCounty.trim()])
      }
      await api.patch('/workers/me', {
        ...bio, ...rates,
        county:     resolvedCounty,
        dailyRate:  rates.dailyRate  ? Number(rates.dailyRate)  : undefined,
        hourlyRate: rates.hourlyRate ? Number(rates.hourlyRate) : undefined,
        workExperience: workExp,
        education: education,
        certifications: certs,
      })
      await api.patch('/workers/me/skills', { skillIds: mySkillIds })
      toast.success('Profile saved!')
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Save failed') }
    setSaving(false)
  }

  const addOtherSkill = async () => {
    if (!otherSkill.trim()) return
    try {
      const s = await createSkill(otherSkill.trim(), 'general')
      setSkills(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s])
      setMySkillIds(prev => prev.includes(s.id) ? prev : [...prev, s.id])
      setOtherSkill(''); setAddingOther(false)
      toast.success(`"${s.name}" added to your skills`)
    } catch { toast.error('Failed to add skill') }
  }

  const filteredSkills = skills.filter(s =>
    !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase())
  )

  const completion = (() => {
    const checks = [!!bio.bio, !!bio.dateOfBirth, !!bio.location, mySkillIds.length > 0,
      !!rates.mpesaPhone, workExp.length > 0, education.length > 0, !!profile?.avatarUrl]
    return Math.round(checks.filter(Boolean).length / checks.length * 100)
  })()

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>My Profile</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            Your professional CV — visible to employers
          </p>
        </div>
        <button onClick={saveProfile} disabled={saving} className="btn btn-primary" style={{ gap:6 }}>
          <Save size={14} /> {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>

      {/* Profile completion bar */}
      <div className="card" style={{ padding:'14px 18px', marginBottom:18,
        background: completion >= 80 ? 'var(--green-pale)' : 'var(--accent-pale)',
        border: `1px solid ${completion >= 80 ? 'var(--green)' : 'var(--accent)'}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontWeight:700, fontSize:13,
            color: completion >= 80 ? 'var(--green)' : 'var(--accent)' }}>
            Profile {completion}% complete
          </span>
          <span style={{ fontSize:12, color:'var(--text-3)' }}>
            {completion < 100 ? 'Add more details to attract employers' : '✓ Complete!'}
          </span>
        </div>
        <div style={{ height:6, background:'rgba(0,0,0,0.08)', borderRadius:3 }}>
          <div style={{ height:'100%', borderRadius:3, transition:'width 0.4s',
            width:`${completion}%`,
            background: completion >= 80 ? 'var(--green)' : 'var(--accent)' }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {([
          { id:'bio'    as const, label:'👤 Bio & Contact' },
          { id:'cv'     as const, label:'📄 CV (Experience & Education)' },
          { id:'skills' as const, label:`⚡ Skills (${mySkillIds.length})` },
          { id:'rates'  as const, label:'💰 Rates & Availability' },
        ]).map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BIO & CONTACT ── */}
      {tab === 'bio' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card" style={{ padding:20, gridColumn:'1/-1' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>About you</div>
            <div style={{ marginBottom:12 }}>
              <label className="lbl">Professional summary *</label>
              <textarea className="inp" rows={3} style={{ resize:'vertical' }}
                placeholder="Experienced field sales agent with 3 years in FMCG distribution..."
                value={bio.bio} onChange={e => setBio(b => ({...b, bio:e.target.value}))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="lbl">Date of birth *</label>
                <input className="inp" type="date" value={bio.dateOfBirth}
                  onChange={e => setBio(b => ({...b, dateOfBirth:e.target.value}))} />
              </div>
              <div>
                <label className="lbl">National ID number</label>
                <input className="inp" placeholder="12345678" value={bio.nationalIdNumber}
                  onChange={e => setBio(b => ({...b, nationalIdNumber:e.target.value}))} />
              </div>
              <div>
                <label className="lbl">Location / Area *</label>
                <input className="inp" placeholder="Westlands, Nairobi" value={bio.location}
                  onChange={e => setBio(b => ({...b, location:e.target.value}))} />
              </div>
              <div>
                <label className="lbl">County *</label>
                <select className="inp" value={bio.county} onChange={e => setBio(b => ({...b, county:e.target.value}))}>
                  <option value="">Select county</option>
                  {allCounties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {bio.county === 'Other' && (
                  <input className="inp" required placeholder="Enter your county"
                    style={{ marginTop:6 }}
                    value={otherCounty}
                    onChange={e => setOtherCounty(e.target.value)} />
                )}
              </div>
              <div>
                <label className="lbl">LinkedIn URL</label>
                <input className="inp" placeholder="linkedin.com/in/yourname" value={bio.linkedinUrl}
                  onChange={e => setBio(b => ({...b, linkedinUrl:e.target.value}))} />
              </div>
              <div>
                <label className="lbl">Languages</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                  {allLanguages.map(lang => {
                    if (lang === 'Other') return (
                      <button key="Other" type="button"
                        onClick={() => setAddingOtherLang(true)}
                        className="btn btn-ghost"
                        style={{ padding:'4px 10px', fontSize:11 }}>
                        + Other
                      </button>
                    )
                    const has = bio.languages.includes(lang)
                    return (
                      <button key={lang} type="button"
                        onClick={() => setBio(b => ({...b, languages: has
                          ? b.languages.filter(l => l !== lang)
                          : [...b.languages, lang]}))}
                        className={`btn ${has ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding:'4px 10px', fontSize:11 }}>
                        {lang}
                      </button>
                    )
                  })}
                  {addingOtherLang && (
                    <div style={{ display:'flex', gap:6, width:'100%', marginTop:4 }}>
                      <input className="inp" placeholder="e.g. Somali, Turkana…"
                        value={otherLang} onChange={e => setOtherLang(e.target.value)}
                        style={{ flex:1, padding:'4px 10px', fontSize:12 }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLanguage() } }} />
                      <button type="button" className="btn btn-primary"
                        style={{ padding:'4px 12px', fontSize:12 }}
                        onClick={addCustomLanguage}>Add</button>
                      <button type="button" className="btn btn-ghost"
                        style={{ padding:'4px 12px', fontSize:12 }}
                        onClick={() => { setAddingOtherLang(false); setOtherLang('') }}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CV: WORK EXPERIENCE & EDUCATION ── */}
      {tab === 'cv' && (
        <div style={{ display:'grid', gap:16 }}>
          {/* Work Experience */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Work Experience</div>
              <button className="btn btn-ghost" style={{ gap:5, fontSize:12 }}
                onClick={() => setWorkExp(w => [...w, { company:'', title:'', startDate:'', endDate:'', current:false, description:'' }])}>
                <Plus size={13} /> Add experience
              </button>
            </div>
            {workExp.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-4)', fontSize:13 }}>
                No work experience added yet
              </div>
            ) : workExp.map((exp, i) => (
              <div key={i} style={{ border:'1px solid var(--border)', borderRadius:10, marginBottom:10, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 14px', background:'var(--surface)', cursor:'pointer' }}
                  onClick={() => setExpandedExp(expandedExp === i ? null : i)}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{exp.title || 'New position'}</div>
                    <div style={{ fontSize:11, color:'var(--text-4)' }}>{exp.company || 'Company'}</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={e => { e.stopPropagation(); setWorkExp(w => w.filter((_,j) => j!==i)) }}
                      className="btn-icon"><X size={13} /></button>
                    {expandedExp === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedExp === i && (
                  <div style={{ padding:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                      <div><label className="lbl">Company *</label>
                        <input className="inp" value={exp.company}
                          onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,company:e.target.value} : x))} /></div>
                      <div><label className="lbl">Job title *</label>
                        <input className="inp" value={exp.title}
                          onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,title:e.target.value} : x))} /></div>
                      <div><label className="lbl">Start date</label>
                        <input className="inp" type="month" value={exp.startDate}
                          onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,startDate:e.target.value} : x))} /></div>
                      <div><label className="lbl">End date</label>
                        <input className="inp" type="month" value={exp.endDate} disabled={exp.current}
                          onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,endDate:e.target.value} : x))} /></div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <input type="checkbox" checked={exp.current}
                        onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,current:e.target.checked,endDate:''} : x))} />
                      <span style={{ fontSize:12 }}>Currently working here</span>
                    </div>
                    <div><label className="lbl">Description</label>
                      <textarea className="inp" rows={2} style={{ resize:'vertical' }} value={exp.description}
                        placeholder="Key responsibilities and achievements..."
                        onChange={e => setWorkExp(w => w.map((x,j) => j===i ? {...x,description:e.target.value} : x))} /></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Education */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Education</div>
              <button className="btn btn-ghost" style={{ gap:5, fontSize:12 }}
                onClick={() => setEd(e => [...e, { institution:'', qualification:'', field:'', startYear:'', endYear:'' }])}>
                <Plus size={13} /> Add education
              </button>
            </div>
            {education.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-4)', fontSize:13 }}>No education added yet</div>
            ) : education.map((edu, i) => (
              <div key={i} style={{ border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  <button onClick={() => setEd(e => e.filter((_,j)=>j!==i))} className="btn-icon"><X size={13}/></button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ gridColumn:'1/-1' }}><label className="lbl">Institution</label>
                    <input className="inp" placeholder="University of Nairobi" value={edu.institution}
                      onChange={e => setEd(ed => ed.map((x,j) => j===i ? {...x,institution:e.target.value} : x))} /></div>
                  <div><label className="lbl">Qualification</label>
                    <input className="inp" placeholder="BSc / Diploma / Certificate" value={edu.qualification}
                      onChange={e => setEd(ed => ed.map((x,j) => j===i ? {...x,qualification:e.target.value} : x))} /></div>
                  <div><label className="lbl">Field of study</label>
                    <input className="inp" placeholder="Business Administration" value={edu.field}
                      onChange={e => setEd(ed => ed.map((x,j) => j===i ? {...x,field:e.target.value} : x))} /></div>
                  <div><label className="lbl">Start year</label>
                    <input className="inp" type="number" placeholder="2018" value={edu.startYear}
                      onChange={e => setEd(ed => ed.map((x,j) => j===i ? {...x,startYear:e.target.value} : x))} /></div>
                  <div><label className="lbl">End year</label>
                    <input className="inp" type="number" placeholder="2022" value={edu.endYear}
                      onChange={e => setEd(ed => ed.map((x,j) => j===i ? {...x,endYear:e.target.value} : x))} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Certifications */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Certifications</div>
              <button className="btn btn-ghost" style={{ gap:5, fontSize:12 }}
                onClick={() => setCerts(c => [...c, { name:'', issuer:'', year:'', expiryYear:'' }])}>
                <Plus size={13} /> Add certification
              </button>
            </div>
            {certs.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-4)', fontSize:13 }}>No certifications added yet</div>
            ) : certs.map((cert, i) => (
              <div key={i} style={{ border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  <button onClick={() => setCerts(c => c.filter((_,j)=>j!==i))} className="btn-icon"><X size={13}/></button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ gridColumn:'1/-1' }}><label className="lbl">Certification name</label>
                    <input className="inp" placeholder="e.g. Google Data Analytics" value={cert.name}
                      onChange={e => setCerts(c => c.map((x,j) => j===i ? {...x,name:e.target.value} : x))} /></div>
                  <div><label className="lbl">Issuing organisation</label>
                    <input className="inp" placeholder="Coursera / KNEC / etc." value={cert.issuer}
                      onChange={e => setCerts(c => c.map((x,j) => j===i ? {...x,issuer:e.target.value} : x))} /></div>
                  <div><label className="lbl">Year obtained</label>
                    <input className="inp" type="number" placeholder="2023" value={cert.year}
                      onChange={e => setCerts(c => c.map((x,j) => j===i ? {...x,year:e.target.value} : x))} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SKILLS ── */}
      {tab === 'skills' && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Your skills</div>
          <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:14 }}>
            Select skills that match your expertise. Employers filter by these.
            Required: at least one skill.
          </p>
          <input className="inp" placeholder="Search skills..." value={skillSearch}
            onChange={e => setSkillSearch(e.target.value)} style={{ marginBottom:14 }} />
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:16 }}>
            {filteredSkills.map(s => {
              const sel = mySkillIds.includes(s.id)
              return (
                <button key={s.id}
                  onClick={() => setMySkillIds(ids => sel ? ids.filter(id=>id!==s.id) : [...ids, s.id])}
                  className={`btn ${sel ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding:'5px 12px', fontSize:12 }}>
                  {sel && '✓ '}{s.name}
                  {s.category && <span style={{ opacity:0.6, marginLeft:4, fontSize:10 }}>{s.category}</span>}
                </button>
              )
            })}
          </div>
          {/* Other / custom skill */}
          {addingOther ? (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input className="inp" placeholder="Enter custom skill name..." style={{ flex:1 }}
                value={otherSkill} onChange={e => setOtherSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOtherSkill()}
                autoFocus />
              <button className="btn btn-primary" onClick={addOtherSkill}>Add</button>
              <button className="btn btn-ghost" onClick={() => { setAddingOther(false); setOtherSkill('') }}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ gap:5 }} onClick={() => setAddingOther(true)}>
              <Plus size={13} /> Add custom skill (Other)
            </button>
          )}
        </div>
      )}

      {/* ── RATES & AVAILABILITY ── */}
      {tab === 'rates' && (
        <div className="card" style={{ padding:20, maxWidth:480 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Rates & Availability</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label className="lbl">Daily rate (KES)</label>
              <input className="inp" type="number" placeholder="1200" value={rates.dailyRate}
                onChange={e => setRates(r => ({...r, dailyRate:e.target.value}))} />
            </div>
            <div>
              <label className="lbl">Hourly rate (KES)</label>
              <input className="inp" type="number" placeholder="150" value={rates.hourlyRate}
                onChange={e => setRates(r => ({...r, hourlyRate:e.target.value}))} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label className="lbl">M-Pesa number (for payouts) *</label>
            <input className="inp" type="tel" placeholder="0712 345 678" value={rates.mpesaPhone}
              onChange={e => setRates(r => ({...r, mpesaPhone:e.target.value}))} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label className="lbl">Availability note</label>
            <input className="inp" placeholder="e.g. Weekdays only, Mon–Fri 8am–6pm" value={rates.availabilityNote}
              onChange={e => setRates(r => ({...r, availabilityNote:e.target.value}))} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0',
            borderTop:'1px solid var(--border)' }}>
            <div style={{ position:'relative', width:44, height:24 }}>
              <input type="checkbox" checked={rates.isAvailable}
                onChange={e => setRates(r => ({...r, isAvailable:e.target.checked}))}
                style={{ position:'absolute', opacity:0, width:'100%', height:'100%', cursor:'pointer', zIndex:1 }} />
              <div style={{ width:44, height:24, borderRadius:12, background: rates.isAvailable ? 'var(--green)' : 'var(--border)', transition:'background 0.2s', position:'absolute' }}>
                <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff',
                  position:'absolute', top:3, transition:'left 0.2s',
                  left: rates.isAvailable ? 'calc(100% - 21px)' : 3 }} />
              </div>
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:13 }}>Available for work</div>
              <div style={{ fontSize:11, color:'var(--text-4)' }}>
                {rates.isAvailable ? 'You appear as available to employers' : 'You are hidden from job matching'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
