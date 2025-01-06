import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";

const CUTE_AVATARS = [
  { id: 'panda', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=panda&backgroundColor=b6e3f4' },
  { id: 'kitten', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=kitten&backgroundColor=ffdfbf' },
  { id: 'puppy', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=puppy&backgroundColor=d1f4d1' },
  { id: 'bunny', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=bunny&backgroundColor=ffd1f4' },
  { id: 'penguin', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=penguin&backgroundColor=f4d1d1' },
  { id: 'fox', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=fox&backgroundColor=f4f1d1' },
];

const profileSchema = z.object({
  displayName: z.string().min(3, "Display name must be at least 3 characters"),
  bio: z.string().max(160, "Bio must not exceed 160 characters"),
  city: z.string().min(2, "Please enter your city"),
  timezone: z.string().min(1, "Please select your timezone"),
  age: z.string()
    .transform(Number)
    .pipe(z.number().min(13, "You must be at least 13 years old").max(120, "Invalid age")),
  avatarUrl: z.string().min(1, "Please select a profile picture"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSetupPage() {
  const { user, updateProfile } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.username || "",
      bio: "",
      city: "",
      timezone: "",
      age: "",
      avatarUrl: CUTE_AVATARS[0].url,
    },
  });

  const onSubmit = async (values: ProfileFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          age: Number(values.age),
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await response.json();

      // Update the user data in react-query cache
      await updateProfile();

      toast({
        title: "Profile setup complete",
        description: "Welcome to the chat application!",
      });

      // Redirect to home page
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Complete Your Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="avatarUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Choose your cute animal avatar</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-3 gap-4"
                      >
                        {CUTE_AVATARS.map((avatar) => (
                          <FormItem key={avatar.id}>
                            <FormControl>
                              <RadioGroupItem
                                value={avatar.url}
                                id={avatar.id}
                                className="sr-only"
                              />
                            </FormControl>
                            <label
                              htmlFor={avatar.id}
                              className="flex flex-col items-center gap-2 cursor-pointer"
                            >
                              <Avatar className="w-24 h-24 border-2 transition-all duration-200 hover:scale-105">
                                <AvatarImage src={avatar.url} alt={avatar.id} />
                              </Avatar>
                              <span className="text-sm capitalize">{avatar.id}</span>
                            </label>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="How should we call you?" {...field} />
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
                        <Input type="number" placeholder="Your age" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Tell us a bit about yourself"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Your city" {...field} />
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
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="America/New_York">EST</SelectItem>
                          <SelectItem value="America/Los_Angeles">PST</SelectItem>
                          <SelectItem value="Europe/London">GMT</SelectItem>
                          <SelectItem value="Asia/Tokyo">JST</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                Complete Setup
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}