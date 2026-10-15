import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' }
export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  const variants = { default: 'bg-[#6b62b3] text-white hover:bg-[#59519d]', outline: 'border border-[#e3e0d7] bg-white text-[#38372f]', ghost: 'bg-transparent text-[#57554e] hover:bg-[#f1eff8]' }
  return <button className={cn('inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50', variants[variant], className)} {...props}/>
}
