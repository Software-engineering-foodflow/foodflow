import { formatDateTime } from '../../../shared/formatDateTime';
import { Link, useSearchParams } from 'react-router';
import { Badge, Table, Text, Tooltip } from '@mantine/core';
import { DataTable } from '../../../shared/ui/DataTable';
import { routes } from '../../../shared/routes';
import { transactionLabels, type Transaction } from '../hooks';
import { reportLink } from '../summary';
import { QuantityPill } from './QuantityPill';
const linkStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44 };
export function TransactionTable({ items, label = '數量異動' }: { items: Transaction[]; label?: string }) {
  const [context] = useSearchParams();
  return <DataTable label={label} minWidth={0} head={<>{['食材／類型與增減', '批次／來源追溯', '原因／FEFO', '時間／操作者'].map(t => <Table.Th key={t}>{t}</Table.Th>)}</>}>
    {items.map(t => <Table.Tr key={t.id}>
      <Table.Td><Text size="lg" fw={700}>{t.ingredient_name}</Text>
        <QuantityPill label={transactionLabels[t.type]} value={t.quantity_delta} unit={t.unit} color={t.type === 'WASTE' || (t.type === 'ADJUSTMENT' && t.quantity_delta.startsWith('-')) ? 'red' : t.type === 'ADJUSTMENT' ? 'orange' : 'forest'} explanation={`批次原有 ${t.quantity_before} ${t.unit}，本次增減 ${t.quantity_delta} ${t.unit}，異動後 ${t.quantity_after} ${t.unit}。`} />
        <Tooltip events={{ hover: true, focus: true, touch: false }} label="此數值為該筆異動的批次前後量，非食材總庫存" withArrow><Text size="xs" c="dimmed" tabIndex={0}>批次 {t.quantity_before} → {t.quantity_after}</Text></Tooltip></Table.Td>
      <Table.Td style={{ overflowWrap: 'anywhere' }}><Link style={linkStyle} to={`${routes.inventoryBatchHistory.replace(":batchId", String(t.batch_id))}?${context}`}>{t.batch_number} 歷程</Link><br />
        <Link style={linkStyle} to={`${routes.goodsReceipts}?receipt_id=${t.source_receipt_id}`}>{t.source_receipt_number}</Link><Text size="xs">進貨明細 #{t.source_item_id}</Text>
        <Link style={linkStyle} to={reportLink(context, "transaction_id", t.id)}>異動 #{t.id}</Link>
        {t.reverses_transaction_id && <Link style={linkStyle} to={reportLink(context, "transaction_id", t.reverses_transaction_id)}>原異動 #{t.reverses_transaction_id}</Link>}
      </Table.Td>
      <Table.Td style={{ overflowWrap: 'anywhere' }}><Text size="sm">{t.reason || '—'}</Text>{t.is_non_fefo ? <Badge color="orange" variant="light">● 非 FEFO</Badge> : <Text size="xs" c="dimmed">非 FEFO：否</Text>}</Table.Td>
      <Table.Td><Text size="sm">{formatDateTime(t.occurred_at)}</Text><Text size="xs" c="dimmed">{t.operator_name} (#{t.operator_id})</Text></Table.Td>
    </Table.Tr>)}
  </DataTable>;
}
