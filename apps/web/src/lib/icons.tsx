/**
 * Resolves the lucide icon NAMES used in @titl/shared constants (CATEGORY_GROUPS, TRAVEL_MODE_META,
 * INQUIRY_QUESTION_META, REPORT_TYPE_META) to components — explicitly imported so tree-shaking keeps the bundle small.
 */
import {
  BadgeAlert,
  BadgeDollarSign,
  BookOpen,
  Cable,
  Car,
  CarTaxiFront,
  Cctv,
  Clock,
  CookingPot,
  CreditCard,
  DoorClosed,
  Dumbbell,
  Factory,
  Footprints,
  Hand,
  Headphones,
  Lamp,
  Laptop,
  MapPinOff,
  MapPinned,
  MessageCircleQuestion,
  MoveRight,
  Package,
  PackageCheck,
  PackageX,
  Refrigerator,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Stethoscope,
  Ticket,
  TrainFront,
  Watch,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { TravelMode } from '@titl/shared';

export const ICONS: Record<string, LucideIcon> = {
  BadgeAlert,
  BadgeDollarSign,
  BookOpen,
  Cable,
  Car,
  CarTaxiFront,
  Cctv,
  Clock,
  CookingPot,
  CreditCard,
  DoorClosed,
  Dumbbell,
  Factory,
  Footprints,
  Hand,
  Headphones,
  Lamp,
  Laptop,
  MapPinOff,
  MapPinned,
  MessageCircleQuestion,
  MoveRight,
  Package,
  PackageCheck,
  PackageX,
  Refrigerator,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Stethoscope,
  Ticket,
  TrainFront,
  Watch,
  Wrench,
};

export function iconByName(name: string | null | undefined, fallback: LucideIcon = Package): LucideIcon {
  return (name && ICONS[name]) || fallback;
}

/** `<DynamicIcon name="Smartphone" />` — decorative by default (aria-hidden). */
export function DynamicIcon({ name, fallback, ...props }: LucideProps & { name: string | null | undefined; fallback?: LucideIcon }) {
  const Icon = iconByName(name, fallback);
  return <Icon aria-hidden {...props} />;
}

export const TRAVEL_MODE_ICON: Record<TravelMode, LucideIcon> = {
  walk: Footprints,
  metro: TrainFront,
  taxi: CarTaxiFront,
  car: Car,
};
