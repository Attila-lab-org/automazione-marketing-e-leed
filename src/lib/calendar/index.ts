export {
  pickFirstCompatibleSlot,
  formatSlotForHuman,
  slotsForAiPrompt,
  type SlotLike,
} from './slots';
export {
  listAvailableSlots,
  listSlotsInRange,
  createAvailabilitySlot,
  updateAvailabilitySlot,
  deleteAvailabilitySlot,
  bookSlotAtomic,
  bookFirstCompatibleSlot,
  cancelAppointment,
  rescheduleAppointment,
  createCalendarEvent,
  updateCalendarEvent,
  listCalendarEvents,
  getActiveAppointmentForLead,
  getNextDeadlineForLead,
  fireCalendarReminder,
  type BookAppointmentResult,
} from './service';
export {
  applyConversationBooking,
  wantsImmediateBooking,
  type ConversationBookingOutcome,
} from './booking';
