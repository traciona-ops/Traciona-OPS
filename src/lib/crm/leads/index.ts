export {
  resolveOwnerIdForCreate,
  resolveSectorForCreate,
  duplicatePhoneError,
  duplicateContactPhoneError,
  nextTopPositionForStage,
} from "./helpers";

export { createLeadDomain, createContactDomain } from "./create";
export type { CreateLeadDomainInput, CreateContactDomainInput } from "./create";

export { moveLeadDomain, moveAllLeadsDomain } from "./move";

export { updateLeadDomain } from "./update";
export type { UpdateLeadPatch } from "./update";

export { deleteLeadDomain } from "./delete";

export { addNoteDomain, addTagDomain, removeTagDomain } from "./notes-tags";

export {
  attachLeadToPipelineDomain,
  addLeadToPipelineDomain,
  attachDealDomain,
  transferLeadDomain,
} from "./attach";
export type { AttachDealDomainInput } from "./attach";

export {
  createLeadSchema,
  createContactSchema,
  moveLeadSchema,
  updateLeadSchema,
  deleteLeadSchema,
  addNoteSchema,
  addTagSchema,
  removeTagSchema,
  attachDealSchema,
  moveAllLeadsSchema,
  transferLeadSchema,
  attachLeadToPipelineSchema,
  addLeadToPipelineSchema,
} from "./schemas";
