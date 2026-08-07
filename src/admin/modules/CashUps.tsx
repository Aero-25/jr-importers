import { useState } from 'react';
import { AlertTriangle, Download, MessageCircle } from 'lucide-react';
import type { TillShiftRow } from '@/lib/database.types';
import { useCashUp, useShifts } from '@/data/till';
import { downloadCashUpPdf, shareCashUpOnWhatsApp } from '@/lib/cashUpPdf';
import { formatDateTime, money } from '@/lib/format';
import { Badge, Button, DataTable, LoadingScreen, Modal, StatTile, type Column, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { CashUpSummary } from './CloseTill';

/**
 * Shift history.
 *
 * Reports are re-derived from `till_cash_up` on open rather than read from the
 * columns written at close, so a report opened months later reflects any
 * corrections made since — and the till, the report and the PDF can never
 * disagree about the numbers.
 */
export default function CashUps() {
  const shifts = useShifts();
  const [selected, setSelected] = useState<TillShiftRow | null>(null);

  const rows = shifts.data ?? [];
  const closed = rows.filter((s) => s.status === 'Closed');
  const offCount = closed.filter((s) => Math.abs(Number(s.cash_variance ?? 0)) > 0.005).length;
  const takings = closed.reduce((n, s) => n + Number(s.total_sales ?? 0), 0);

  const columns: Column<TillShiftRow>[] = [
    {
      key: 'shift',
      header: 'Shift',
      render: (s) => (
        <div className="min-w-0">
          <p className="tabular font-semibold text-ink">#{s.id}</p>
          <p className="truncate text-xs text-ink-subtle">Till {s.till_id}</p>
        </div>
      ),
      sortValue: (s) => s.id,
      width: '6rem',
    },
    {
      key: 'cashier',
      header: 'Cashier',
      render: (s) => <span className="text-ink">{s.cashier_name ?? '—'}</span>,
      sortValue: (s) => s.cashier_name ?? '',
    },
    {
      key: 'opened',
      header: 'Opened',
      secondary: true,
      render: (s) => <span className="text-xs text-ink-muted">{formatDateTime(s.opening_time)}</span>,
      sortValue: (s) => s.opening_time,
    },
    {
      key: 'sales',
      header: 'Sales',
      align: 'right',
      render: (s) => <span className="tabular font-medium">{money(s.total_sales)}</span>,
      sortValue: (s) => Number(s.total_sales ?? 0),
    },
    {
      key: 'petty',
      header: 'Petty cash',
      align: 'right',
      secondary: true,
      render: (s) => <span className="tabular text-ink-muted">{money(s.petty_cash_total)}</span>,
      sortValue: (s) => Number(s.petty_cash_total ?? 0),
    },
    {
      key: 'variance',
      header: 'Variance',
      align: 'right',
      render: (s) => {
        if (s.status !== 'Closed') return <span className="text-xs text-ink-subtle">—</span>;
        const v = Number(s.cash_variance ?? 0);
        const off = Math.abs(v) > 0.005;
        return (
          <span className={`tabular font-semibold ${off ? 'text-danger' : 'text-success'}`}>
            {off ? `${v > 0 ? '+' : '−'}${money(Math.abs(v)).replace('N$ ', 'N$')}` : 'balanced'}
          </span>
        );
      },
      sortValue: (s) => Math.abs(Number(s.cash_variance ?? 0)),
    },
    {
      key: 'stock',
      header: 'Phones',
      render: (s) =>
        Number(s.stock_variance_total ?? 0) > 0 ? (
          <Badge tone="danger" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>
            {s.stock_variance_total} off
          </Badge>
        ) : s.status === 'Closed' ? (
          <Badge tone="success" size="sm">
            matched
          </Badge>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
      sortValue: (s) => Number(s.stock_variance_total ?? 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge tone={s.status === 'Open' ? 'info' : 'neutral'} size="sm">
          {s.status}
        </Badge>
      ),
      sortValue: (s) => s.status,
    },
  ];

  return (
    <>
      <ModuleHeader title="Cash ups" description="Every till shift, and how it reconciled." />

      <div className="space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Shifts recorded" value={rows.length} />
          <StatTile label="Takings (closed shifts)" value={money(takings)} tone="brand" />
          <StatTile
            label="Shifts that did not balance"
            value={offCount}
            tone={offCount > 0 ? 'danger' : 'success'}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(s) => s.id}
            loading={shifts.isLoading}
            onRowClick={setSelected}
            defaultSort={{ key: 'shift', direction: 'desc' }}
            empty={{
              title: 'No shifts yet',
              message: 'Open the till from the POS terminal to record the first one.',
            }}
          />
        </div>
      </div>

      {selected && <CashUpDialog shift={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function CashUpDialog({ shift, onClose }: { shift: TillShiftRow; onClose: () => void }) {
  const toast = useToast();
  const report = useCashUp(shift.id);
  const [sharing, setSharing] = useState(false);

  async function share() {
    if (!report.data) return;
    setSharing(true);
    try {
      window.open(await shareCashUpOnWhatsApp(report.data), '_blank', 'noopener');
    } catch (error) {
      toast.error('Could not share the report', error instanceof Error ? error.message : undefined);
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cash up — shift #${shift.id}`}
      description={`Till ${shift.till_id} · ${shift.cashier_name ?? '—'}`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!report.data}
            onClick={() => report.data && void downloadCashUpPdf(report.data)}
          >
            Download PDF
          </Button>
          <Button
            variant="success"
            icon={<MessageCircle className="h-4 w-4" />}
            disabled={!report.data}
            loading={sharing}
            onClick={share}
          >
            Send on WhatsApp
          </Button>
        </>
      }
    >
      {report.isLoading ? (
        <LoadingScreen label="Building the cash up…" />
      ) : report.data ? (
        <CashUpSummary report={report.data} />
      ) : (
        <p className="text-sm text-danger">
          {report.error?.message ?? 'Could not build this report.'}
        </p>
      )}
    </Modal>
  );
}
