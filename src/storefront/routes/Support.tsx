import { useState, type FormEvent } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Card, Input, Textarea, useToast } from '@/ui';
import { useSeo } from '../seo';

export default function Support() {
  useSeo({
    title: 'Support & special orders',
    description:
      'Ask JR Importers a question, or request a specific phone, laptop or accessory to be imported for you.',
    path: '/support',
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Support &amp; special orders
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Cannot find what you need? Tell us the exact model and we will quote you on importing it.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <SpecialOrderForm />
        <ContactForm />
      </div>
    </div>
  );
}

/** Writes to `special_order_requests` — anon insert is permitted by policy. */
function SpecialOrderForm() {
  const toast = useToast();
  const [product, setProduct] = useState('');
  const [variant, setVariant] = useState('');
  const [budget, setBudget] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    const { error } = await supabase.from('special_order_requests').insert({
      requested_product: product.trim(),
      preferred_color_storage: variant.trim() || null,
      target_budget: budget ? Number(budget) : null,
      customer_name: name.trim() || null,
      customer_phone: phone.trim() || null,
      customer_email: email.trim().toLowerCase() || null,
      city: city.trim() || null,
    });
    setBusy(false);

    if (error) {
      toast.error('Could not send your request', error.message);
      return;
    }

    toast.success('Request received', 'We will come back to you with a quote.');
    setProduct('');
    setVariant('');
    setBudget('');
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Search aria-hidden className="h-5 w-5 text-brand-400" />
        Request a specific item
      </h2>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <Input
          label="What do you want?"
          required
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="e.g. iPhone 15 Pro Max 256GB"
        />
        <Input
          label="Colour / storage"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          placeholder="Natural Titanium, 256GB"
        />
        <Input
          label="Target budget (N$)"
          type="number"
          inputMode="decimal"
          min={0}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Town" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" fullWidth loading={busy}>
          Send request
        </Button>
      </form>
    </Card>
  );
}

/** Writes to `messages` — the console's Messages module reads these. */
function ContactForm() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    const { error } = await supabase.from('messages').insert({
      name: name.trim() || null,
      email: email.trim().toLowerCase() || null,
      message: message.trim(),
    });
    setBusy(false);

    if (error) {
      toast.error('Could not send your message', error.message);
      return;
    }

    toast.success('Message sent', 'We usually reply within a business day.');
    setMessage('');
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <MessageSquare aria-hidden className="h-5 w-5 text-brand-400" />
        Send us a message
      </h2>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Textarea
          label="Message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
        />
        <Button type="submit" fullWidth loading={busy}>
          Send message
        </Button>
      </form>
    </Card>
  );
}
