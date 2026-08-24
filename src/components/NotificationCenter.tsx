"use client";

import { Bell, CheckCheck, FileInput, Mail, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CustomerPortalRequest } from "@/lib/customer-portal-types";
import type { Customer, EmailIntakeTicket } from "@/lib/types";

interface NotificationCenterProps {
  portalRequests: CustomerPortalRequest[];
  emailTickets: EmailIntakeTicket[];
  customers: Customer[];
  readEmailIds: string[];
  onOpenPortalRequest: (requestId: string) => void;
  onOpenEmailTicket: (ticketId: string) => void;
  onMarkPortalRead: (requestId: string) => void;
  onMarkAllPortalRead: () => void;
  onMarkEmailRead: (ticketId: string) => void;
  onMarkAllEmailRead: () => void;
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function NotificationCenter({
  portalRequests,
  emailTickets,
  customers,
  readEmailIds,
  onOpenPortalRequest,
  onOpenEmailTicket,
  onMarkPortalRead,
  onMarkAllPortalRead,
  onMarkEmailRead,
  onMarkAllEmailRead
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState({
    portalRequests: true,
    emailTickets: true,
    customerUploads: true,
    quoteApprovals: true,
    proofChanges: true,
    reorders: true,
    customerMessages: true
  });

  useEffect(() => {
    function loadPreferences() {
      if (typeof window === "undefined") return;
      try {
        const saved = JSON.parse(
          window.localStorage.getItem("gross-printing-notification-settings-v1") ?? "null"
        ) as unknown;
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          setPreferences((current) => ({ ...current, ...(saved as Partial<typeof current>) }));
        }
      } catch {
        // Keep defaults when a browser preference record cannot be read.
      }
    }
    loadPreferences();
    window.addEventListener("gross-printing-notification-settings-change", loadPreferences);
    return () =>
      window.removeEventListener("gross-printing-notification-settings-change", loadPreferences);
  }, []);

  const portalNotifications = useMemo(
    () =>
      portalRequests
        .filter((request) => !["Converted", "Closed", "Archived", "Completed"].includes(request.status))
        .filter((request) => {
          if (request.type === "file_upload") return preferences.customerUploads;
          if (request.type === "quote_approval") return preferences.quoteApprovals;
          if (request.type === "proof_approval" || request.type === "proof_changes") return preferences.proofChanges;
          if (request.type === "reorder") return preferences.reorders;
          if (request.type === "message") return preferences.customerMessages;
          return preferences.portalRequests;
        })
        .map((request) => {
          const customer = customers.find((item) => item.id === request.customerId);
          return {
            id: `portal-${request.id}`,
            source: "portal" as const,
            recordId: request.id,
            unread: !request.notificationReadAt,
            title:
              request.type === "proof_approval"
                ? "Customer approved a proof"
                : request.type === "proof_changes"
                  ? "Customer requested proof changes"
                  : request.type === "quote_approval"
                    ? "Customer approved a quote"
                    : request.type === "reorder"
                      ? "Customer requested a reorder"
                      : request.type === "file_upload"
                        ? "Customer uploaded a file"
                        : request.type === "message"
                          ? "Customer sent a portal message"
                          : "New customer portal request",
            detail: `${customer?.name ?? "Customer"} · ${request.requestNumber ?? request.title}`,
            createdAt: request.createdAt,
            icon: request.fileName ? Upload : FileInput
          };
        }),
    [customers, portalRequests, preferences]
  );

  const emailNotifications = useMemo(
    () =>
      emailTickets
        .filter(() => preferences.emailTickets)
        .filter((ticket) =>
          ["New", "Missing Information", "Waiting for Customer", "AI Reviewed"].includes(ticket.status)
        )
        .map((ticket) => ({
          id: `email-${ticket.id}`,
          source: "email" as const,
          recordId: ticket.id,
          unread: !readEmailIds.includes(ticket.id),
          title:
            ticket.lastCustomerReplyAt
              ? "Customer replied to an email ticket"
              : ticket.status === "Missing Information"
                ? "Email ticket needs information"
                : "New email intake ticket",
          detail: `${ticket.customerName ?? "Customer not matched"} · ${ticket.ticketNumber ?? ticket.subject}`,
          createdAt: ticket.lastCustomerReplyAt ?? ticket.updatedAt,
          icon: Mail
        })),
    [emailTickets, readEmailIds, preferences.emailTickets]
  );

  const notifications = [...portalNotifications, ...emailNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unreadCount = notifications.filter((item) => item.unread).length;

  function openNotification(notification: (typeof notifications)[number]) {
    if (notification.source === "portal") {
      onMarkPortalRead(notification.recordId);
      onOpenPortalRequest(notification.recordId);
    } else {
      onMarkEmailRead(notification.recordId);
      onOpenEmailTicket(notification.recordId);
    }
    setOpen(false);
  }

  return (
    <div className="notification-center">
      <button
        className={`notification-bell ${open ? "active" : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${unreadCount} unread notifications`}
      >
        <Bell size={18} />
        {unreadCount ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
      </button>

      {open ? (
        <section className="notification-popover" role="dialog" aria-label="Notifications">
          <header>
            <div>
              <p>Gross Printing activity</p>
              <h3>Notifications</h3>
            </div>
            <button className="icon-only" type="button" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={17} />
            </button>
          </header>
          <div className="notification-toolbar">
            <span>{unreadCount} unread</span>
            <button
              type="button"
              onClick={() => {
                onMarkAllPortalRead();
                onMarkAllEmailRead();
              }}
              disabled={!unreadCount}
            >
              <CheckCheck size={15} />
              Mark all read
            </button>
          </div>
          <div className="notification-list">
            {notifications.map((notification) => {
              const Icon = notification.icon;
              return (
                <button
                  className={notification.unread ? "unread" : ""}
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                >
                  <span className="notification-icon"><Icon size={16} /></span>
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.detail}</small>
                    <em>{formatDateTime(notification.createdAt)}</em>
                  </span>
                  {notification.unread ? <i /> : null}
                </button>
              );
            })}
            {!notifications.length ? (
              <div className="notification-empty">
                <Bell size={25} />
                <strong>No new activity</strong>
                <span>Portal requests and important email tickets will appear here.</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
