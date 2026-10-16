import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowRight,
  Building2,
  Pencil,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  useAddClinicMember,
  useClinicMembers,
  useClinics,
  useCreateClinic,
  useUpdateClinicMember,
} from "@/hooks/use-clinics"
import { setSelectedClinicId } from "@/lib/clinic-session"
import type { Clinic, ClinicMembership } from "@/types/clinic"

function CreateClinicDialog({
  onCreated,
  onToast,
}: {
  onCreated: (clinic: Clinic) => void
  onToast: (message: string) => void
}) {
  const createClinic = useCreateClinic()
  const [clinicName, setClinicName] = useState("")
  const [open, setOpen] = useState(false)

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setClinicName("")
      createClinic.reset()
    }
  }

  async function submitClinic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = clinicName.trim()
    if (!name) return

    try {
      const clinic = await createClinic.mutateAsync(name)
      onCreated(clinic)
      onToast(`${clinic.name} was created.`)
      changeOpen(false)
    } catch {
      // The mutation error is rendered in the dialog.
    }
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button type="button" />}>
        <Plus data-icon="inline-start" />
        Add clinic
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add clinic</DialogTitle>
          <DialogDescription>
            Create a clinic before assigning clinicians and patients.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submitClinic}>
          <FieldGroup>
            <Field data-invalid={Boolean(createClinic.error)}>
              <FieldLabel htmlFor="clinic-name">Clinic name</FieldLabel>
              <Input
                aria-invalid={Boolean(createClinic.error)}
                autoFocus
                id="clinic-name"
                maxLength={120}
                onChange={(event) => setClinicName(event.target.value)}
                placeholder="Northside Therapy"
                value={clinicName}
              />
              <FieldError>{createClinic.error?.message}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={createClinic.isPending || !clinicName.trim()}
              type="submit"
            >
              {createClinic.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Create clinic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddClinicianDialog({
  clinic,
  onToast,
}: {
  clinic: Clinic
  onToast: (message: string) => void
}) {
  const addMember = useAddClinicMember()
  const [email, setEmail] = useState("")
  const [open, setOpen] = useState(false)

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setEmail("")
      addMember.reset()
    }
  }

  async function submitMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    try {
      await addMember.mutateAsync({
        clinicId: clinic.clinicId,
        email: normalizedEmail,
      })
      onToast(`Clinician access was added to ${clinic.name}.`)
      changeOpen(false)
    } catch {
      // The mutation error is rendered in the dialog.
    }
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button size="sm" type="button" />}>
        <Plus data-icon="inline-start" />
        Add clinician
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add clinician</DialogTitle>
          <DialogDescription>
            Add a clinician to {clinic.name}. A new account will be invited if
            the email is not already registered.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submitMember}>
          <FieldGroup>
            <Field data-invalid={Boolean(addMember.error)}>
              <FieldLabel htmlFor={`clinician-email-${clinic.clinicId}`}>
                Email
              </FieldLabel>
              <Input
                aria-invalid={Boolean(addMember.error)}
                autoFocus
                id={`clinician-email-${clinic.clinicId}`}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="clinician@example.com"
                type="email"
                value={email}
              />
              <FieldDescription>
                Clinic users are assigned the Clinician role.
              </FieldDescription>
              <FieldError>{addMember.error?.message}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={addMember.isPending || !email.trim()}
              type="submit"
            >
              {addMember.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Add clinician
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditClinicianDialog({
  membership,
  onToast,
}: {
  membership: ClinicMembership
  onToast: (message: string) => void
}) {
  const updateMember = useUpdateClinicMember()
  const [active, setActive] = useState(membership.status === "active")
  const [open, setOpen] = useState(false)

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setActive(membership.status === "active")
      updateMember.reset()
    }
  }

  async function submitMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await updateMember.mutateAsync({
        clinicId: membership.clinicId,
        status: active ? "active" : "inactive",
        userSub: membership.userSub,
      })
      onToast("Clinician access was updated.")
      setOpen(false)
    } catch {
      // The mutation error is rendered in the dialog.
    }
  }

  const email = membership.email ?? membership.userSub
  const switchId = `clinician-active-${membership.clinicId}-${membership.userSub}`

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger
        render={<Button size="xs" type="button" variant="outline" />}
      >
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit clinician</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submitMember}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`clinician-role-${membership.userSub}`}>
                Role
              </FieldLabel>
              <Input
                disabled
                id={`clinician-role-${membership.userSub}`}
                value="Clinician"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Clinic access</FieldTitle>
                <FieldDescription>
                  {active
                    ? "This clinician can access the clinic."
                    : "This clinician cannot access the clinic."}
                </FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Active clinic access"
                checked={active}
                id={switchId}
                onCheckedChange={setActive}
              />
            </Field>
            <FieldError>{updateMember.error?.message}</FieldError>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={updateMember.isPending} type="submit">
              {updateMember.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClinicUsers({
  clinic,
  expanded,
  onToast,
}: {
  clinic: Clinic
  expanded: boolean
  onToast: (message: string) => void
}) {
  const membersQuery = useClinicMembers(clinic.clinicId, expanded)

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Clinicians</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage the users assigned to this clinic.
          </p>
        </div>
        <AddClinicianDialog clinic={clinic} onToast={onToast} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {membersQuery.data?.map((membership) => (
              <tr className="border-t" key={membership.userSub}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="size-4 text-muted-foreground" />
                    <span>{membership.email ?? membership.userSub}</span>
                  </div>
                </td>
                <td className="px-4 py-3">Clinician</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      membership.status === "active" ? "secondary" : "outline"
                    }
                  >
                    {membership.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <EditClinicianDialog
                    membership={membership}
                    onToast={onToast}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {membersQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading clinicians...
          </div>
        ) : null}
        {membersQuery.error ? (
          <p className="px-4 py-6 text-sm text-destructive">
            {membersQuery.error.message}
          </p>
        ) : null}
        {!membersQuery.isLoading && !membersQuery.data?.length ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>No clinicians yet</EmptyTitle>
              <EmptyDescription>
                Add a clinician to give them access to this clinic.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </div>
  )
}

export function ClinicsPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const clinicsQuery = useClinics()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expandedClinics, setExpandedClinics] = useState<string[]>([])

  function viewClinic(clinicId: string) {
    setSelectedClinicId(clinicId)
    void queryClient.invalidateQueries()
    navigate("/patients")
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clinics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open a clinic to manage its clinicians or continue to its patient
            list.
          </p>
        </div>
        <CreateClinicDialog
          onCreated={(clinic) => setExpandedClinics([clinic.clinicId])}
          onToast={onToast}
        />
      </div>

      {clinicsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border px-6 py-12 text-sm text-muted-foreground">
          <Spinner />
          Loading clinics...
        </div>
      ) : null}

      {clinicsQuery.error ? (
        <p className="text-sm text-destructive">{clinicsQuery.error.message}</p>
      ) : null}

      {clinicsQuery.data?.length ? (
        <Accordion
          className="gap-3"
          multiple
          onValueChange={setExpandedClinics}
          value={expandedClinics}
        >
          {clinicsQuery.data.map((clinic) => (
            <AccordionItem
              className="rounded-xl border bg-card px-5 shadow-sm"
              key={clinic.clinicId}
              value={clinic.clinicId}
            >
              <div className="flex items-center gap-3 py-3">
                <AccordionTrigger
                  aria-label={`Expand ${clinic.name}`}
                  className="size-8 flex-none items-center justify-center p-0 hover:no-underline **:data-[slot=accordion-trigger-icon]:ml-0"
                />
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Building2 className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold">
                      {clinic.name}
                    </span>
                  </span>
                </div>
                <Button
                  onClick={() => viewClinic(clinic.clinicId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  View clinic
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
              <AccordionContent className="pb-5">
                <ClinicUsers
                  clinic={clinic}
                  expanded={expandedClinics.includes(clinic.clinicId)}
                  onToast={onToast}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : null}

      {!clinicsQuery.isLoading && !clinicsQuery.data?.length ? (
        <Empty className="border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>No clinics yet</EmptyTitle>
            <EmptyDescription>
              Add the first clinic to begin assigning clinicians.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </main>
  )
}
