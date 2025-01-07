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
  "/avatars/cat.svg",
  "/avatars/dog.svg",
  "/avatars/fox.svg",
  "/avatars/owl.svg",
  "/avatars/panda.svg",
  "/avatars/penguin.svg",
  "/avatars/rabbit.svg",
  "/avatars/tiger.svg",
  "/avatars/koala.svg",
  "/avatars/bear.svg",
  "/avatars/lion.svg",
  "/avatars/elephant.svg",
  "/avatars/monkey.svg",
  "/avatars/giraffe.svg",
  "/avatars/unicorn.svg",
  "/avatars/dragon.svg"
];

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  age: z.string().regex(/^\d*$/, "Age must be a number").optional().transform(val => val === "" ? null : parseInt(val, 10)),
  city: z.string().min(2, "City must be at least 2 characters").optional().nullable(),
  status: z.enum(["online", "away", "busy"]),
  avatarUrl: z.string().url("Invalid avatar URL"),
});

type UserSettingsFormData = z.infer<typeof formSchema>;

type UserSettingsProps = {
  user: User;
};

export function UserSettings({ user }: UserSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserSettingsFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user.username,
      age: user.age?.toString() || "",
      city: user.city || "",
      status: user.status || "online",
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
    onSuccess: (updatedUser) => {
      // Update the user data in the cache
      queryClient.setQueryData(['user'], updatedUser);

      toast({
        title: "Changes saved",
        description: "Your changes have been saved automatically.",
        duration: 2000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsAutoSaving(false);
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

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="w-64 py-4 rounded-none border-t hover:bg-accent/10 text-sm font-medium transition-colors relative"
      >
        Settings
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                      <Input type="text" placeholder="Enter age" {...field} />
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
                <div className="grid grid-cols-4 gap-4 mt-2 max-h-64 overflow-y-auto">
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
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}