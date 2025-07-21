import { Transform } from "class-transformer";
import { ContentObjectEntity } from "src/features/activitypub/entities/content-object.entity";
import { DataSource, ViewColumn, ViewEntity } from "typeorm";

@ViewEntity({
    expression: (dataSource: DataSource) => dataSource
        .createQueryBuilder()
        .from(ContentObjectEntity, "object")
        .where("object.type = :type", { type: "Note" })
})
export class Status {
    @ViewColumn()
    public type: string;
}