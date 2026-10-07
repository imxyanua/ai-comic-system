import { Request, Response } from "express";
import { internalPortOnly } from "./security";

function run(path: string, localPort: number) {
  const response = { statusCode: 200, status: jest.fn(), json: jest.fn() };
  response.status.mockImplementation((code: number) => {
    response.statusCode = code;
    return response;
  });
  const next = jest.fn();
  const request = { path, socket: { localPort } } as unknown as Request;
  internalPortOnly(3001)(request, response as unknown as Response, next);
  return { status: response.statusCode, nextCalled: next.mock.calls.length > 0 };
}

describe("internalPortOnly", () => {
  it("chặn route nội bộ trên cổng public", () => {
    expect(run("/internal/v1/jobs/x", 3000)).toEqual({ status: 404, nextCalled: false });
  });

  it("cho route nội bộ trên cổng nội bộ", () => {
    expect(run("/internal/v1/jobs/x", 3001)).toEqual({ status: 200, nextCalled: true });
  });

  it("không đụng route public", () => {
    expect(run("/api/v1/comics", 3000)).toEqual({ status: 200, nextCalled: true });
  });
});
