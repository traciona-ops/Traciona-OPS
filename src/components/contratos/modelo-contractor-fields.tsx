"use client";

import { maskCpf, maskCnpj } from "@/lib/utils/masks";
import { cn } from "@/lib/utils/ui";
import { inputCls, labelCls, sectionCls } from "./status-meta";

type ModeloContractorFieldsProps = {
  tipoContrato: "pf" | "pj";
};

export function ModeloContractorFields({
  tipoContrato,
}: ModeloContractorFieldsProps) {
  return (
    <>
      <p className={cn(sectionCls, "mb-2.5 mt-5")}>3 · Dados do contratante</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {tipoContrato === "pj" && (
          <>
            <label className={labelCls}>
              Razão social *
              <input
                name="nome"
                required
                placeholder="Como está no cartão CNPJ"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              CNPJ *
              <input
                name="cnpj"
                required
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                onChange={(e) => {
                  e.currentTarget.value = maskCnpj(e.currentTarget.value);
                }}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Quem assina pela empresa *
              <input
                name="representante"
                required
                placeholder="Nome completo"
                className={inputCls}
              />
            </label>
          </>
        )}
        <label className={labelCls}>
          CPF * {tipoContrato === "pj" ? "(de quem assina)" : ""}
          <input
            name="cpf"
            required
            placeholder="000.000.000-00"
            inputMode="numeric"
            onChange={(e) => {
              e.currentTarget.value = maskCpf(e.currentTarget.value);
            }}
            className={inputCls}
          />
        </label>
        <label className={cn(labelCls, "sm:col-span-2")}>
          Endereço completo *
          <input
            name="endereco"
            required
            placeholder="Rua, nº, bairro, cidade – UF, CEP"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          E-mail do cliente *
          <input
            name="email"
            type="email"
            placeholder="Vai no contrato e na Autentique"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Telefone (vazio = usa o do cadastro)
          <input name="telefone" className={inputCls} />
        </label>
        <label className={labelCls}>
          Empresa do cliente (opcional)
          <input
            name="empresa"
            placeholder="Entra como titular/representante dela"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Nacionalidade (opcional)
          <input
            name="nacionalidade"
            defaultValue="brasileiro(a)"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Estado civil (opcional)
          <input
            name="estado_civil"
            placeholder="Ex.: casado(a)"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Profissão (opcional)
          <input
            name="profissao"
            placeholder="Ex.: empresário(a)"
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          RG (opcional)
          <input name="rg" className={inputCls} />
        </label>
      </div>
    </>
  );
}
