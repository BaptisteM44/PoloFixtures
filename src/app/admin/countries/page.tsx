"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "@/components/AdminNav";

type Country = { id: string; code: string; name: string };

export default function AdminCountriesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const load = () => {
    fetch("/api/admin/known-countries")
      .then((res) => res.json())
      .then((data) => setCountries(data));
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    await fetch("/api/admin/known-countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.toUpperCase(), name })
    });
    setCode("");
    setName("");
    load();
  };

  const remove = async (countryCode: string) => {
    await fetch("/api/admin/known-countries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: countryCode })
    });
    load();
  };

  return (
    <div className="admin-page">
      <h1>Known Bike Polo Countries</h1>
      <AdminNav />
      <div className="panel">
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="US" />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="United States" />
          </label>
        </div>
        <button onClick={add}>Add</button>
      </div>
      <div className="panel">
        {countries.map((c) => (
          <div key={c.id} className="moderation-row">
            <div>{c.name} ({c.code})</div>
            <button className="ghost" onClick={() => remove(c.code)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
