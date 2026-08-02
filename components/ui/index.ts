// Barrel export for UI primitives. Import from "@/components/ui" anywhere
// in the app:
//
//   import { Button, Card, Badge, Avatar, Modal, Input, Textarea, Select } from "@/components/ui";
//
// Centralizing the import path means we can later swap an implementation
// (e.g., wrap in a different library) without touching every callsite.

export { default as Avatar } from "./Avatar";
export { default as LeadAvatar } from "./LeadAvatar";
export { default as DismissibleError, useError } from "./DismissibleError";
export { useConfirm, type ConfirmOptions } from "./Confirm";
export { default as Badge } from "./Badge";
export { default as Button } from "./Button";
export { default as Card } from "./Card";
export { default as Modal } from "./Modal";
export { Input, Textarea, Select } from "./Input";
export { default as PageHeader, SectionLabel } from "./PageHeader";
export { default as EmptyState } from "./EmptyState";
export { default as Skeleton, SkeletonText, SkeletonRows } from "./Skeleton";
