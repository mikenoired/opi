import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../cn";

const ContextMenu = (props: React.ComponentProps<typeof ContextMenuPrimitive.Root>) => (
	<ContextMenuPrimitive.Root {...props} />
);

const ContextMenuTrigger = ({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) => (
	<ContextMenuPrimitive.Trigger
		data-slot="context-menu-trigger"
		className={cn("select-none", className)}
		{...props}
	/>
);

const ContextMenuGroup = (props: React.ComponentProps<typeof ContextMenuPrimitive.Group>) => (
	<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
);
const ContextMenuPortal = (props: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) => (
	<ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
);
const ContextMenuSub = (props: React.ComponentProps<typeof ContextMenuPrimitive.SubmenuRoot>) => (
	<ContextMenuPrimitive.SubmenuRoot {...props} />
);
const ContextMenuRadioGroup = (props: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) => (
	<ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />
);

function ContextMenuContent({
	className,
	side,
	align,
	sideOffset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Popup> &
	React.ComponentProps<typeof ContextMenuPrimitive.Positioner>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset}>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"z-50 max-h-(--available-height) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
						className
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<ContextMenuPrimitive.Item
			data-slot="context-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"group/context-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}
		/>
	);
}

function ContextMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubmenuTrigger> & { inset?: boolean }) {
	return (
		<ContextMenuPrimitive.SubmenuTrigger
			data-slot="context-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}>
			{children}
			<ChevronRightIcon className="cn-rtl-flip ml-auto" />
		</ContextMenuPrimitive.SubmenuTrigger>
	);
}

const ContextMenuSubContent = ({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Popup>) => (
	<ContextMenuPrimitive.Positioner>
		<ContextMenuPrimitive.Popup
			data-slot="context-menu-sub-content"
			className={cn(
				"z-50 min-w-32 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
				className
			)}
			{...props}
		/>
	</ContextMenuPrimitive.Positioner>
);

function ContextMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & { inset?: boolean }) {
	return (
		<ContextMenuPrimitive.CheckboxItem
			data-slot="context-menu-checkbox-item"
			data-inset={inset}
			checked={checked}
			className={cn(
				"relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-inset:pl-7",
				className
			)}
			{...props}>
			<span className="pointer-events-none absolute right-2">
				<ContextMenuPrimitive.CheckboxItemIndicator>
					<CheckIcon />
				</ContextMenuPrimitive.CheckboxItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.CheckboxItem>
	);
}

function ContextMenuRadioItem({
	className,
	children,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & { inset?: boolean }) {
	return (
		<ContextMenuPrimitive.RadioItem
			data-slot="context-menu-radio-item"
			data-inset={inset}
			className={cn(
				"relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-inset:pl-7",
				className
			)}
			{...props}>
			<span className="pointer-events-none absolute right-2">
				<ContextMenuPrimitive.RadioItemIndicator>
					<CheckIcon />
				</ContextMenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.RadioItem>
	);
}

const ContextMenuLabel = ({
	className,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.GroupLabel> & { inset?: boolean }) => (
	<ContextMenuPrimitive.GroupLabel
		data-slot="context-menu-label"
		data-inset={inset}
		className={cn("px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7", className)}
		{...props}
	/>
);
const ContextMenuSeparator = ({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) => (
	<ContextMenuPrimitive.Separator
		data-slot="context-menu-separator"
		className={cn("-mx-1 my-1 h-px bg-border", className)}
		{...props}
	/>
);
const ContextMenuShortcut = ({ className, ...props }: React.ComponentProps<"span">) => (
	<span
		data-slot="context-menu-shortcut"
		className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
		{...props}
	/>
);

export {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuCheckboxItem,
	ContextMenuRadioItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuGroup,
	ContextMenuPortal,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuRadioGroup,
};
