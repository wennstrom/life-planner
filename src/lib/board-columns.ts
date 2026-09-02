export function columnSelectOptions(
  columns: Array<{ _id: string; name: string; isDone: boolean }>,
) {
  return [
    { value: '', label: 'Backlog' },
    ...columns.map((column) => ({ value: column._id, label: column.name })),
  ]
}
