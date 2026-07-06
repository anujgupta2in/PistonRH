import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListVessels,
  useListUserVesselAccess,
  useGrantVesselAccess,
  useRevokeVesselAccess,
  getListUsersQueryKey,
  getListUserVesselAccessQueryKey,
  getListVesselsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Ship, UserCog, Pencil } from "lucide-react";
import type { UserProfile } from "@workspace/api-client-react";

const createUserSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  role: z.enum(["vessel_officer", "technical_office"]),
});

const editUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  role: z.enum(["vessel_officer", "technical_office"]),
  password: z.union([z.literal(""), z.string().min(8, "Password must be at least 8 characters")]),
});

function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createUser = useCreateUser();

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", password: "", fullName: "", role: "vessel_officer" },
  });

  const onSubmit = (data: z.infer<typeof createUserSchema>) => {
    createUser.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "User created" });
          onCreated();
          setOpen(false);
          form.reset();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>Create a new account for a vessel officer or technical office staff member.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="fullName" render={({ field }) => (
              <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="vessel_officer">Vessel Officer</SelectItem>
                    <SelectItem value="technical_office">Technical Office</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onUpdated,
}: {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const updateUser = useUpdateUser();

  const form = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    values: { fullName: user.fullName, role: user.role, password: "" },
  });

  const onSubmit = (data: z.infer<typeof editUserSchema>) => {
    updateUser.mutate(
      {
        userId: user.id,
        data: {
          fullName: data.fullName,
          role: data.role,
          ...(data.password ? { password: data.password } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "User updated" });
          onUpdated();
          onOpenChange(false);
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User — {user.fullName}</DialogTitle>
          <DialogDescription>
            Update details, or reset this user's password. Leave the password field blank to keep it unchanged.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="fullName" render={({ field }) => (
              <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="vessel_officer">Vessel Officer</SelectItem>
                    <SelectItem value="technical_office">Technical Office</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>New Password (optional)</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Leave blank to keep current password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function VesselAccessDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: number;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVesselId, setSelectedVesselId] = useState<string>("");

  const { data: allVessels } = useListVessels({ query: { enabled: open, queryKey: getListVesselsQueryKey() } });
  const { data: access, isLoading } = useListUserVesselAccess(userId, {
    query: { enabled: open, queryKey: getListUserVesselAccessQueryKey(userId) },
  });
  const grantAccess = useGrantVesselAccess();
  const revokeAccess = useRevokeVesselAccess();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUserVesselAccessQueryKey(userId) });

  const grantedIds = new Set((access ?? []).map((a) => a.vesselId));
  const availableVessels = (allVessels ?? []).filter((v) => !grantedIds.has(v.id));

  const handleGrant = () => {
    const vesselId = parseInt(selectedVesselId);
    if (!vesselId) return;
    grantAccess.mutate(
      { userId, data: { vesselId } },
      {
        onSuccess: () => { invalidate(); setSelectedVesselId(""); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleRevoke = (vesselId: number) => {
    revokeAccess.mutate(
      { userId, vesselId },
      {
        onSuccess: () => invalidate(),
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vessel Access — {userName}</DialogTitle>
          <DialogDescription>Grant or revoke access to specific vessels for this Vessel Officer.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={selectedVesselId} onValueChange={setSelectedVesselId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select a vessel to grant…" /></SelectTrigger>
            <SelectContent>
              {availableVessels.map((v) => (
                <SelectItem key={v.id} value={v.id.toString()}>{v.vesselName}</SelectItem>
              ))}
              {availableVessels.length === 0 && (
                <SelectItem value="__none__" disabled>No more vessels to grant</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleGrant} disabled={!selectedVesselId || grantAccess.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="animate-spin" /></div>
          ) : (access ?? []).length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-6">No vessel access granted yet.</div>
          ) : (
            (access ?? []).map((a) => (
              <div key={a.vesselId} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Ship className="h-4 w-4 text-muted-foreground" />
                  {a.vesselName}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRevoke(a.vesselId)}
                  disabled={revokeAccess.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManagementCard() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [accessDialogUserId, setAccessDialogUserId] = useState<number | null>(null);
  const [editDialogUserId, setEditDialogUserId] = useState<number | null>(null);

  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleToggleActive = (userId: number, isActive: boolean) => {
    updateUser.mutate(
      { userId, data: { isActive } },
      { onSuccess: invalidate, onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }) },
    );
  };

  const handleDelete = (userId: number, fullName: string) => {
    if (!confirm(`Delete user "${fullName}"? This cannot be undone.`)) return;
    deleteUser.mutate(
      { userId },
      { onSuccess: invalidate, onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }) },
    );
  };

  const accessDialogUser = users?.find((u) => u.id === accessDialogUserId);
  const editDialogUser = users?.find((u) => u.id === editDialogUserId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> User Management</CardTitle>
            <CardDescription className="mt-1">
              Create accounts and control which vessels each Vessel Officer can access. Technical Office
              accounts have fleet-wide access by default.
            </CardDescription>
          </div>
          <AddUserDialog onCreated={invalidate} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[28rem] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Vessel Access</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "technical_office" ? "default" : "secondary"}>
                        {u.role === "technical_office" ? "Technical Office" : "Vessel Officer"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.role === "technical_office" ? (
                        <span className="text-xs text-muted-foreground">Fleet-wide</span>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAccessDialogUserId(u.id)}>
                          {u.vesselIds?.length ?? 0} vessel{u.vesselIds?.length === 1 ? "" : "s"} — Manage
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        disabled={u.id === currentUser?.id}
                        onCheckedChange={(checked) => handleToggleActive(u.id, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditDialogUserId(u.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={u.id === currentUser?.id}
                        onClick={() => handleDelete(u.id, u.fullName)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(users ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>

      {accessDialogUser && (
        <VesselAccessDialog
          userId={accessDialogUser.id}
          userName={accessDialogUser.fullName}
          open={accessDialogUserId !== null}
          onOpenChange={(open) => !open && setAccessDialogUserId(null)}
        />
      )}

      {editDialogUser && (
        <EditUserDialog
          user={editDialogUser}
          open={editDialogUserId !== null}
          onOpenChange={(open) => !open && setEditDialogUserId(null)}
          onUpdated={invalidate}
        />
      )}
    </Card>
  );
}
