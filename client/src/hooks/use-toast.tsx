import { Toast, ToastActionElement, ToastProps } from "@/components/ui/toast"
import {
  toast,
  useToast as useToastBase,
  ToastOptions as ToastOptionsBase
} from "@/components/ui/use-toast"

export type ToastProps = ToastProps & {
  altText?: string;
  action?: ToastActionElement;
}

export function useToast() {
  const { toast: baseToast } = useToastBase()
  
  return {
    toast: ({ ...props }: ToastProps) => {
      baseToast({
        ...props,
        position: "top", // Force position to top
      })
    },
    dismiss: (toastId?: string) => baseToast.dismiss(toastId),
  }
}

export { toast }
