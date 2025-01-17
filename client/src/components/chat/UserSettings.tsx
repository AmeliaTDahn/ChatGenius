import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@db/schema";
import { useDebouncedCallback } from "use-debounce";
import { Label } from "@/components/ui/label";
import { UploadCloud } from "lucide-react";

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
  hideActivity: z.boolean(),
  avatarUrl: z.string().url("Invalid avatar URL"),
  timezone: z.string().min(1, "Please select a timezone"),
});

type UserSettingsFormData = z.infer<typeof formSchema>;

type UserSettingsProps = {
  user: User;
  isOpen?: boolean;
  onClose?: () => void;
};

export function UserSettings({ user, isOpen = false, onClose }: UserSettingsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
      });
      queryClient.clear();
      window.location.href = '/';
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const form = useForm<UserSettingsFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user.username,
      age: user.age,
      city: user.city || "",
      hideActivity: user.hideActivity,
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
      return res.json() as Promise<User>;
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['user'] });
      const previousData = queryClient.getQueryData<User>(['user']);

      if (previousData) {
        queryClient.setQueryData<User>(['user'], {
          ...previousData,
          ...newData,
        });
      }

      return { previousData };
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['user'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['user'] });

      form.reset({
        username: updatedUser.username,
        age: updatedUser.age,
        city: updatedUser.city || "",
        hideActivity: updatedUser.hideActivity,
        avatarUrl: updatedUser.avatarUrl || avatarOptions[0],
        timezone: updatedUser.timezone || "UTC",
      }, { keepValues: true });

      setIsAutoSaving(false);
      toast({
        title: "Settings Saved",
        description: "Your changes have been saved successfully.",
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

  const handleDeleteAccount = () => {
    deleteAccount.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
        </DialogHeader>

        <ScrollArea className="pr-4 h-[70vh]">
          <Form {...form}>
            <form onSubmit={(e) => {
              e.preventDefault();
              const data = form.getValues();
              updateProfile.mutate(data);
            }} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter username" {...field} />
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
                name="hideActivity"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Hide Activity</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Hide your online status from other users
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <FormLabel>Profile Photo</FormLabel>
                <div className="grid grid-cols-3 gap-4 mb-4">
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

                <div className="space-y-4">
                  <Label>Or Upload Your Own Photo</Label>
                  <div className="border-2 border-dashed rounded-lg p-4">
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud className="h-8 w-8 text-muted-foreground" />
                      <Input
                        type="file"
                        accept="image/*"
                        className="max-w-xs"
                        disabled={isUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsUploading(true);
                            const formData = new FormData();
                            formData.append('files', file);
                            const formValues = form.getValues();
                            Object.entries(formValues).forEach(([key, value]) => {
                              if (key !== 'files') {
                                formData.append(key, value?.toString() || '');
                              }
                            });
                            formData.append('hideActivity', form.getValues('hideActivity').toString());

                            try {
                              const response = await fetch('/api/user/profile', {
                                method: 'PUT',
                                body: formData,
                                credentials: 'include'
                              });

                              if (!response.ok) throw new Error(await response.text());
                              const updatedUser = await response.json();
                              queryClient.setQueryData(['user'], updatedUser);
                              toast({
                                title: "Profile photo updated",
                                description: "Your photo has been uploaded successfully.",
                              });
                              form.setValue("avatarUrl", updatedUser.avatarUrl);
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message,
                                variant: "destructive",
                              });
                            } finally {
                              setIsUploading(false);
                            }
                          }
                        }}
                      />
                      <p className="text-sm text-muted-foreground text-center">
                        Upload a JPG, PNG, or GIF image (max 5MB)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>

          <div className="mt-6 border-t pt-6">
            <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
            <p className="text-sm text-gray-500 mt-2">Once you delete your account, there is no going back.</p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </Button>

            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Account</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete your account? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteAccount.mutate()}
                    disabled={deleteAccount.isPending}
                  >
                    {deleteAccount.isPending ? "Deleting..." : "Delete Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}