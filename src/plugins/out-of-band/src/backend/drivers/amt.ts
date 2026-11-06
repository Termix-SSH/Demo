import type { PowerAction, Reading } from "../../shared/types.js";
import { baseUrl, describeStatus, digestRequest } from "./http.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

const NS = "http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2";
const ADDRESSING = "http://schemas.xmlsoap.org/ws/2004/08/addressing";
const ANONYMOUS = `${ADDRESSING}/role/anonymous`;

const TRANSFER_GET = "http://schemas.xmlsoap.org/ws/2004/09/transfer/Get";

let counter = 0;

function envelope(
  action: string,
  resource: string,
  selectors: string,
  body: string,
) {
  counter += 1;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:a="${ADDRESSING}" xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">` +
    `<Header><a:To>/wsman</a:To>` +
    `<w:ResourceURI>${resource}</w:ResourceURI>` +
    `<a:ReplyTo><a:Address>${ANONYMOUS}</a:Address></a:ReplyTo>` +
    `<a:Action>${action}</a:Action>` +
    `<a:MessageID>${counter}</a:MessageID>` +
    `<w:OperationTimeout>PT30S</w:OperationTimeout>` +
    (selectors ? `<w:SelectorSet>${selectors}</w:SelectorSet>` : "") +
    `</Header><Body>${body}</Body></Envelope>`
  );
}

async function post(
  target: Target,
  io: DriverIo,
  xml: string,
): Promise<string> {
  const response = await digestRequest(
    target,
    io,
    `${baseUrl(target, "http")}/wsman`,
    {
      method: "POST",
      headers: { "content-type": "application/soap+xml;charset=UTF-8" },
      body: xml,
    },
    target.credentials.username ?? "",
    target.credentials.password ?? "",
  );
  if (!response.ok) {
    throw new DriverError(describeStatus(response.status), response.status);
  }
  return response.text();
}

function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<(?:[\\w]+:)?${name}[^>]*>([^<]*)<`).exec(xml)?.[1];
}

const SERVICE = `${NS}/CIM_PowerManagementService`;

// CIM_PowerManagementService PowerState values
const STATES: Record<PowerAction, number> = {
  on: 2,
  off: 8,
  "graceful-shutdown": 12,
  cycle: 5,
  reset: 10,
};

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const xml = await post(
    target,
    io,
    envelope(
      TRANSFER_GET,
      `${NS}/CIM_AssociatedPowerManagementService`,
      "",
      "",
    ),
  );
  const state = Number(tag(xml, "PowerState"));
  return {
    at: new Date().toISOString(),
    info: {},
    power: Number.isFinite(state) ? (state === 2 ? "on" : "off") : "unknown",
    health: "unknown",
    sensors: [],
  };
}

async function power(
  target: Target,
  io: DriverIo,
  action: PowerAction,
): Promise<void> {
  const selectors =
    `<w:Selector Name="Name">Intel(r) AMT Power Management Service</w:Selector>` +
    `<w:Selector Name="SystemName">Intel(r) AMT</w:Selector>` +
    `<w:Selector Name="CreationClassName">CIM_PowerManagementService</w:Selector>` +
    `<w:Selector Name="SystemCreationClassName">CIM_ComputerSystem</w:Selector>`;
  const body =
    `<r:RequestPowerStateChange_INPUT xmlns:r="${SERVICE}">` +
    `<r:PowerState>${STATES[action]}</r:PowerState>` +
    `<r:ManagedElement><a:Address>${ANONYMOUS}</a:Address>` +
    `<a:ReferenceParameters><w:ResourceURI>${NS}/CIM_ComputerSystem</w:ResourceURI>` +
    `<w:SelectorSet><w:Selector Name="CreationClassName">CIM_ComputerSystem</w:Selector>` +
    `<w:Selector Name="Name">ManagedSystem</w:Selector></w:SelectorSet>` +
    `</a:ReferenceParameters></r:ManagedElement></r:RequestPowerStateChange_INPUT>`;
  const xml = await post(
    target,
    io,
    envelope(`${SERVICE}/RequestPowerStateChange`, SERVICE, selectors, body),
  );
  const code = tag(xml, "ReturnValue");
  if (code !== undefined && code !== "0") {
    throw new DriverError(`The BMC refused the power change (code ${code})`);
  }
}

export const amt: Driver = {
  info: {
    id: "amt",
    defaultPort: 16992,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: false,
      eventLog: false,
      boot: false,
      media: false,
      console: false,
    },
    powerActions: ["on", "off", "graceful-shutdown", "cycle", "reset"],
  },
  read,
  power,
};
