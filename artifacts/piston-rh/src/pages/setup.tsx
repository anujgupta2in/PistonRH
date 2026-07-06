import { useState } from "react";
import { Ship, Loader2, Play } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useCreateVessel,
  useLoadDemoVessel,
  getListVesselsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  vesselName: z.string().min(2, "Vessel name must be at least 2 characters"),
  imoNumber: z.string().optional(),
  engineMake: z.string().optional(),
  engineModel: z.string().optional(),
  numCylinders: z.coerce.number().min(1).max(14),
});

export default function SetupPage() {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canLoadDemo = user?.role === "technical_office";
  
  const createVessel = useCreateVessel();
  const loadDemo = useLoadDemoVessel();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vesselName: "",
      imoNumber: "",
      engineMake: "MAN B&W",
      engineModel: "",
      numCylinders: 6,
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createVessel.mutate(
      { data },
      {
        onSuccess: () => {
          toast({
            title: "Vessel created",
            description: "The vessel profile has been created successfully.",
          });
          queryClient.invalidateQueries({ queryKey: getListVesselsQueryKey() });
          window.location.reload();
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message || "Failed to create vessel",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleLoadDemo = () => {
    setIsDemoLoading(true);
    loadDemo.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Demo Data Loaded",
          description: "Demo vessel has been loaded successfully.",
        });
        queryClient.invalidateQueries({ queryKey: getListVesselsQueryKey() });
        window.location.reload();
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err.message || "Failed to load demo data",
          variant: "destructive",
        });
        setIsDemoLoading(false);
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-6 lg:gap-12 items-center">
        <div className="space-y-6">
          <div>
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-xl mb-4 text-primary">
              <Ship size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Welcome to ME Components RH Records</h1>
            <p className="text-muted-foreground text-lg">
              The professional running hours record system for marine main engines.
            </p>
          </div>
          
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">1</div>
              <div>
                <p className="font-semibold text-foreground">Configure your vessel</p>
                <p className="text-muted-foreground">Setup your engine type and cylinder count.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">2</div>
              <div>
                <p className="font-semibold text-foreground">Register components</p>
                <p className="text-muted-foreground">Add crowns, skirts, and rings to your inventory.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">3</div>
              <div>
                <p className="font-semibold text-foreground">Track movements</p>
                <p className="text-muted-foreground">Log monthly RH and component rotations to track wear automatically.</p>
              </div>
            </div>
          </div>
        </div>

        <Card className="shadow-lg border-primary/10">
          <CardHeader>
            <CardTitle>Setup First Vessel</CardTitle>
            <CardDescription>
              {canLoadDemo
                ? "Create an empty vessel profile, or start with demo data to see how it works."
                : "Create your vessel's profile to get started."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {canLoadDemo && (
              <>
                <Button
                  variant="outline"
                  className="w-full h-16 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={handleLoadDemo}
                  disabled={isDemoLoading || createVessel.isPending}
                >
                  {isDemoLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-5 w-5 text-primary" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold text-foreground">Load Demo Vessel</div>
                    <div className="text-xs text-muted-foreground font-normal">Pre-filled with MT. Bochem Marengo data</div>
                  </div>
                </Button>

                <div className="flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Or create new</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="vesselName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MV Voyager" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="engineMake"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engine Make</FormLabel>
                        <FormControl>
                          <Input placeholder="MAN B&W" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="numCylinders"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cylinders</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createVessel.isPending || isDemoLoading}>
                  {createVessel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Vessel
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
