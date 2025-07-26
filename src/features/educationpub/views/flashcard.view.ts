// src/features/educationpub/views/flashcard.view.ts

import { ApiResponseProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ContentObjectEntity } from "src/features/activitypub/entities/content-object.entity";
import { DataSource, ViewColumn, ViewEntity } from "typeorm";

@ViewEntity({
    expression: (dataSource: DataSource) => dataSource
        .createQueryBuilder()
        .from(ContentObjectEntity, "object")
        // CORRECTED: Changed 'Flashcardd' to 'Flashcard' to fix typo and ensure correct filtering.
        .where("object.type = 'Flashcard'")
})
export class Flashcard {
    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['id'])
    @ApiResponseProperty()
    public id: string;

    @ViewColumn()
    @ApiResponseProperty()
    public type: string;

    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['edu:model'])
    @ApiResponseProperty()
    public model: string;

    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['edu:fieldsData'])
    @ApiResponseProperty({ type: JSON })
    public fieldsData: object;

    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['edu:tags'])
    @ApiResponseProperty()
    public tags: string[];

    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['edu:targetLanguage'])
    @ApiResponseProperty()
    public targetLanguage: string;

    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['edu:sourceLanguage'])
    @ApiResponseProperty()
    public sourceLanguage: string;

    // @ViewColumn({ name: "data" })
    // public data: object;
}
