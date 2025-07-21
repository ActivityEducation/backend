import { ApiResponseProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ContentObjectEntity } from "src/features/activitypub/entities/content-object.entity";
import { DataSource, ViewColumn, ViewEntity } from "typeorm";

@ViewEntity({
    expression: (dataSource: DataSource) => dataSource
        .createQueryBuilder()
        .from(ContentObjectEntity, "object")
        .where("object.type = 'FlashcardModel'")
})
export class Flashcard {
    @ViewColumn({ name: "data" })
    @Transform(({ value }) => value?.['id'])
    @ApiResponseProperty()
    public id: string;

    @ViewColumn()
    @ApiResponseProperty()
    public type: string;

    // @ViewColumn({ name: "data" })
    // public data: object;
}