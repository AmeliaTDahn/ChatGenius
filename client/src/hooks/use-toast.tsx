import { Toast, ToastActionElement, ToastProps } from "@/components/ui/toast"
import {
  toast,
  useToast as useToastBase,
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
        duration: 3000, 
        className: "top-4 right-4", 
      })
    },
    dismiss: (toastId?: string) => baseToast.dismiss(toastId),
  }
}

export { toast }