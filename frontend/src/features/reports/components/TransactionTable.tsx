import { formatDateTime } from "../../../shared/formatDateTime";
import { Link } from "react-router";
import { Table, Text } from "@mantine/core";
import { routes } from "../../../shared/routes";
import { transactionLabels, type Transaction } from "../hooks";
export function TransactionTable({ items }: { items: Transaction[] }) {
  return <Table.ScrollContainer minWidth={1000}><Table>
    <Table.Thead><Table.Tr>{["時間／操作者", "食材／批次", "類型／增減／前後量", "原因／非 FEFO", "來源／追溯"].map(t => <Table.Th key={t}>{t}</Table.Th>)}</Table.Tr></Table.Thead>
    <Table.Tbody>{items.map(t => <Table.Tr key={t.id}>
      <Table.Td>{formatDateTime(t.occurred_at)}<br />{t.operator_name} (#{t.operator_id})</Table.Td>
      <Table.Td>{t.ingredient_name} (#{t.ingredient_id})<br />
        <Link to={`${routes.reports}?batch_id=${t.batch_id}`}>{t.batch_number} 歷程</Link><br />
        <Link to={`${routes.inventory}?batch_id=${t.batch_id}`}>庫存頁</Link></Table.Td>
      <Table.Td>{transactionLabels[t.type]} {t.quantity_delta} {t.unit}<br />{t.quantity_before} → {t.quantity_after}</Table.Td>
      <Table.Td>{t.reason}<br />非 FEFO：{t.is_non_fefo ? "是" : "否"}</Table.Td>
      <Table.Td><Link to={`${routes.goodsReceipts}?receipt_id=${t.source_receipt_id}`}>{t.source_receipt_number}</Link>
        <Text size="xs">進貨明細 #{t.source_item_id}</Text>
        <Link to={`${routes.reports}?transaction_id=${t.id}`}>異動 #{t.id}</Link>
        <Text size="xs" style={{ overflowWrap: "anywhere" }}>操作群組 {t.operation_group_id}</Text>
        {t.reverses_transaction_id && <Link to={`${routes.reports}?transaction_id=${t.reverses_transaction_id}`}>原異動 #{t.reverses_transaction_id}</Link>}
      </Table.Td>
    </Table.Tr>)}</Table.Tbody>
  </Table></Table.ScrollContainer>;
}
