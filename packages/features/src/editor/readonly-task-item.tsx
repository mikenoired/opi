import { CheckboxGroup, EditableCheckboxItem, ReadonlyCheckboxItem } from "@monolyth/ui/components";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

function checkedIndices(node: NodeViewProps["node"]) {
	const indices = new Set<number>();
	node.content.forEach((child, _offset, index) => {
		if (child.attrs.checked) indices.add(index);
	});
	return indices;
}

export function TaskListView({ node }: NodeViewProps) {
	return (
		<NodeViewWrapper as="ul" data-type="taskList">
			<CheckboxGroup checkedIndices={checkedIndices(node)} className="monolyth-task-list-group">
				<NodeViewContent as="div" className="monolyth-task-list-content" />
			</CheckboxGroup>
		</NodeViewWrapper>
	);
}

export function ReadonlyTaskItemView({ node }: NodeViewProps) {
	return (
		<NodeViewWrapper
			as="li"
			className="monolyth-task-item"
			data-type="taskItem"
			data-checked={node.attrs.checked}>
			<ReadonlyCheckboxItem checked={node.attrs.checked} label={node.textContent} />
		</NodeViewWrapper>
	);
}

export function EditableTaskItemView({ node, updateAttributes }: NodeViewProps) {
	return (
		<NodeViewWrapper
			as="li"
			className="monolyth-task-item"
			data-type="taskItem"
			data-checked={node.attrs.checked}>
			<EditableCheckboxItem
				checked={node.attrs.checked}
				onToggle={(checked) => updateAttributes({ checked })}>
				<NodeViewContent as="div" />
			</EditableCheckboxItem>
		</NodeViewWrapper>
	);
}
