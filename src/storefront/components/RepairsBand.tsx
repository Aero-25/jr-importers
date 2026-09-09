import { Link } from 'react-router-dom';
import { ArrowUpRight, BatteryCharging, Phone, ShieldCheck, Smartphone, Wrench } from 'lucide-react';
import { STORE } from '@/lib/constants';
import { useReveal } from '@/ui/effects';

const JOBS = [
  { icon: Smartphone, label: 'Screen replacement' },
  { icon: BatteryCharging, label: 'Battery replacement' },
  { icon: ShieldCheck, label: 'Data recovery' },
];

export function RepairsBand() {
  const revealRoot = useReveal<HTMLDivElement>();
  return (
    <section className="coast-repairs" aria-labelledby="coast-repair-title">
      <div ref={revealRoot} className="coast-shell-width coast-repair-grid">
        <div className="coast-repair-image reveal">
          <img src="/coastline-repair.webp" alt="Precision tools and a smartphone on a repair workbench" width={1000} height={700} loading="lazy" />
          <span className="coast-repair-image-label"><Wrench aria-hidden size={16} />Care, down to the detail.</span>
          <div className="coast-repair-image-corner" aria-hidden><ArrowUpRight size={25} /></div>
        </div>
        <div className="coast-repair-copy reveal" data-reveal-index="2">
          <p className="coast-repair-eyebrow">The JR workshop</p>
          <h2 id="coast-repair-title">A little care.<br /><span>A lot more life.</span></h2>
          <p className="coast-repair-description">Cracked screen? Battery flat by lunchtime? Bring your handset to {STORE.address}. Our in-house team will take a look.</p>
          <ul className="coast-repair-jobs">{JOBS.map(({ icon: Icon, label }) => <li key={label}><Icon aria-hidden size={16} />{label}</li>)}</ul>
          <p className="coast-repair-detail">Get your job card by WhatsApp, sign on your phone and track your repair until it’s ready to collect.</p>
          <div className="coast-repair-actions">
            <a href={`tel:${STORE.phone.replace(/\s/g, '')}`} className="coast-repair-call"><Phone aria-hidden size={17} />{STORE.phone}</a>
            <Link to="/about">Find the shop<ArrowUpRight aria-hidden size={18} /></Link>
          </div>
          <p className="coast-repair-note">Repairs are quoted at the counter. Anything over N$350 is confirmed with you before we start.</p>
        </div>
      </div>
    </section>
  );
}
