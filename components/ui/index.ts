// Barrel export for UI primitives. Import from "@/components/ui" anywhere
// in the app:
//
//   import { Button, Card, Badge, Avatar, Modal, Input, Textarea, Select } from "@/components/ui";
//
// Centralizing the import path means we can later swap an implementation
// (e.g., wrap in a different library) without touching every callsite.

export { default as Avatar } from "./Avatar";
export { default as LeadAvatar } from "./LeadAvatar";
export { default as Badge } from "./Badge";
export { default as Button } from "./Button";
export { default as Card } from "./Card";
export { default as Modal } from "./Modal";
export { Input, Textarea, Select } from "./Input";
