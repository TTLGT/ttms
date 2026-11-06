import {
  AlertTriangle, CalendarDays, Calculator, Compass, Contact, ListTodo,
  MessageCircle, Phone, Search, Target, Truck, Users, type LucideIcon,
} from 'lucide-react';
import type { GuideIconName } from '@/lib/onboarding/guideTypes';

const ICONS: Record<GuideIconName, LucideIcon> = {
  chat: MessageCircle, tasks: ListTodo, calendar: CalendarDays, directory: Contact,
  quote: Calculator, truck: Truck, phone: Phone, search: Search, alert: AlertTriangle,
  target: Target, users: Users, compass: Compass,
};

/** Each guide's colour, so a guide is recognisable at a glance. Families mapped for dark mode. */
export const GUIDE_TONE: Record<GuideIconName, string> = {
  chat:      'bg-brand-50 text-brand-700',
  tasks:     'bg-indigo-50 text-indigo-700',
  calendar:  'bg-cyan-50 text-cyan-700',
  directory: 'bg-green-50 text-green-700',
  quote:     'bg-amber-50 text-amber-800',
  truck:     'bg-blue-50 text-blue-700',
  phone:     'bg-pink-50 text-pink-700',
  search:    'bg-purple-50 text-purple-700',
  alert:     'bg-red-50 text-red-700',
  target:    'bg-orange-50 text-orange-700',
  users:     'bg-teal-50 text-teal-700',
  compass:   'bg-gray-100 text-gray-700',
};

export default function GuideIcon({ name, size = 18, className = '' }: { name: GuideIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} />;
}
