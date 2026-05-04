import type { IntakeForm } from "./ai/types";

export const COMMUNITY_OPTIONS = [
  "Gujarati Hindu",
  "Modern Western",
  "Muslim Nikah",
  "Christian",
  "Sikh",
  "Interfaith",
  "Modern non-religious",
] as const;

export const STYLE_OPTIONS = [
  "Traditional premium",
  "Modern luxury",
  "Royal palace",
  "Minimal elegant",
  "Celestial night",
  "Floral garden",
  "Festival map",
  "Editorial magazine",
] as const;

export const DEFAULT_INTAKE: IntakeForm = {
  brideName: "Kavya",
  groomName: "Mihir",
  weddingDate: "March 22, 2026",
  venue: "Akshar Grand Palace",
  location: "Somerset, New Jersey",
  community: "Gujarati Hindu",
  styleDirection: "Traditional premium",
  mood: "festive, royal, emotional, rich, not template-like",
  language: "English + Gujarati",
  heroMessage:
    "With blessings of Shri Ganesh and our families, we invite you to celebrate a joyful Gujarati wedding filled with mehendi, garba, baraat, sacred pheras, dinner, music, and love.",
  imageUrl:
    "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?auto=format&fit=crop&w=1500&q=90",
};
