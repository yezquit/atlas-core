export const PERSONAL_OWNER_ID = "personal";

export function recordOwnerId(record) {
  return record?.owner_id || PERSONAL_OWNER_ID;
}

export function belongsToPersonalOwner(record, ownerId = PERSONAL_OWNER_ID) {
  return recordOwnerId(record) === ownerId;
}
