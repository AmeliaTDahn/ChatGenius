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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  age: z.coerce.number().min(13, "You must be at least 13 years old").max(120, "Invalid age").nullable(),
  city: z.string().min(2, "City must be at least 2 characters").nullable(),
  status: z.enum(["online", "away", "busy"]),
  avatarUrl: z.string().url("Invalid avatar URL"),
  timezone: z.string().min(1, "Please select a timezone"),
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
      timezone: user.timezone || "UTC",
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
          city: data.city || null,
          timezone: data.timezone
        }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['user'] });
      const previousData = queryClient.getQueryData(['user']);
      queryClient.setQueryData(['user'], old => ({
        ...old,
        ...newData
      }));
      return { previousData };
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['user'], updatedUser);
      toast({
        title: "Changes saved",
        description: "Your profile has been updated successfully.",
        duration: 2000,
      });
    },
    onError: (error: Error, _newData, context) => {
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

  const debouncedSave = useDebouncedCallback((data: UserSettingsFormData) => {
    setIsAutoSaving(true);
    updateProfile.mutate(data);
  }, 1000);

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
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="away">Away</SelectItem>
                      <SelectItem value="busy">Busy</SelectItem>
                    </SelectContent>
                  </Select>
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