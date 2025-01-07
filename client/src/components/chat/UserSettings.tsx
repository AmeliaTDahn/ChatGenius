import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@db/schema";
import { useDebouncedCallback } from "use-debounce";

const avatarOptions = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=panda&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/bottts/svg?seed=kitten&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/bottts/svg?seed=puppy&backgroundColor=d1f4d1",
  "https://api.dicebear.com/7.x/bottts/svg?seed=bunny&backgroundColor=ffd1f4",
  "https://api.dicebear.com/7.x/bottts/svg?seed=penguin&backgroundColor=f4d1d1",
  "https://api.dicebear.com/7.x/bottts/svg?seed=fox&backgroundColor=f4f1d1",
];

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  age: z.coerce.number().min(13, "You must be at least 13 years old").max(120, "Invalid age").nullable(),
  city: z.string().min(2, "City must be at least 2 characters").nullable(),
  status: z.enum(["online", "away", "busy"]),
  avatarUrl: z.string().url("Invalid avatar URL"),
});

type UserSettingsFormData = z.infer<typeof formSchema>;

type UserSettingsProps = {
  user: User;
  onClose?: () => void;
};

export function UserSettings({ user, onClose }: UserSettingsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserSettingsFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user.username,
      age: user.age,
      city: user.city || "",
      status: user.status as "online" | "away" | "busy",
      avatarUrl: user.avatarUrl || avatarOptions[0],
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (data: UserSettingsFormData) => {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          age: data.age || null,
          city: data.city || null
        }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: async (newData) => {
      // Cancel any outgoing refetches 
      await queryClient.cancelQueries({ queryKey: ['user'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['user']);

      // Optimistically update to the new value
      queryClient.setQueryData(['user'], old => ({
        ...old,
        ...newData
      }));

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: (updatedUser) => {
      // Update the user data in the cache
      queryClient.setQueryData(['user'], updatedUser);

      toast({
        title: "Changes saved",
        description: "Your profile has been updated successfully.",
        duration: 2000,
      });
    },
    onError: (error: Error, _newData, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(['user'], context.previousData);
      }

      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsAutoSaving(false);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    }
  });

  // Debounced auto-save function
  const debouncedSave = useDebouncedCallback((data: UserSettingsFormData) => {
    setIsAutoSaving(true);
    updateProfile.mutate(data);
  }, 1000); // Wait 1 second after the last change before saving

  // Watch for form changes and trigger auto-save
  const handleFormChange = useCallback(() => {
    const data = form.getValues();
    const isValid = form.formState.isValid;

    if (isValid) {
      debouncedSave(data);
    }
  }, [form, debouncedSave]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && onClose) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onChange={handleFormChange} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter display name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="age"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Enter age" 
                      {...field} 
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter city" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="online">Online</option>
                      <option value="away">Away</option>
                      <option value="busy">Busy</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Avatar</FormLabel>
              <div className="grid grid-cols-3 gap-4 mt-2">
                {avatarOptions.map((avatar) => (
                  <Button
                    key={avatar}
                    type="button"
                    variant={form.getValues("avatarUrl") === avatar ? "secondary" : "outline"}
                    className="p-2 relative overflow-hidden transition-all hover:scale-105"
                    onClick={() => {
                      form.setValue("avatarUrl", avatar);
                      handleFormChange();
                    }}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={avatar} alt="Avatar option" />
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    {form.getValues("avatarUrl") === avatar && (
                      <div className="absolute inset-0 bg-primary/10 rounded-md" />
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {isAutoSaving && (
              <p className="text-sm text-muted-foreground">Saving changes...</p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}