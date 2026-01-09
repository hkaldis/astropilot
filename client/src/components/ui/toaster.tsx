import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Award, Star } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const variant = props.variant as string | undefined;
        const isBadge = variant === "badge";
        const isLevelUp = variant === "levelUp";
        
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3">
              {isBadge && (
                <div className="shrink-0 relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center animate-pulse">
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
                </div>
              )}
              {isLevelUp && (
                <div className="shrink-0 relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                    <Star className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-purple-400/30 star-burst" />
                </div>
              )}
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
