package com.classes;

/**
 * Created by Austen on 01/08/2016.
 */
public class Ingredient extends BaseItem {

    private String uom;
    private int defaultValue;
    private boolean favourite;
    private boolean essential;
    private int quantity;
    private String quantityText;
    private boolean added;
    private boolean hidden = false;
    private Boolean isSelected;

    public String getUOM(){
        return uom;
    }

    public void setUOM(String uom){
        this.uom = uom;
    }

    public int getDefaultValue(){
        return defaultValue;
    }

    public void setDefaultValue(int defaultValue){
        this.defaultValue = defaultValue;
    }

    public boolean getFavourite(){
        return favourite;
    }

    public void setFavourite(int favourite){
        this.favourite = ReturnBoolean(favourite);
    }

    public boolean getEssential(){
        return essential;
    }

    public void setEssential(int essential){
        this.essential = ReturnBoolean(essential);
    }

    public int getQuantity(){
        return quantity;
    }

    public void setQuantity(int quantity){
        this.quantity = quantity;
        this.setQuantityText(convertUOM(getUOM()));
    }

    public String getQuantityText(){
        return quantityText;
    }

    private void setQuantityText(String quantityText){
        this.quantityText = quantityText;
    }

    public boolean getAdded(){
        return added;
    }

    public void setadded(int added){
        this.added = ReturnBoolean(added);
    }

    public boolean getHidden(){
        return hidden;
    }

    public void setHidden(int hidden){
        this.hidden = ReturnBoolean(hidden);
    }

    private boolean ReturnBoolean(int value) {
        if (value == 0){
            return false;
        }
        else{
            return true;
        }
    }

    public Boolean getIsSelected()
    { return isSelected; }

    public void setIsSelected(Boolean value)
    { isSelected = value; }

    // Toggles whatever the isSelected value is currently set to
    public void setIsSelected()
    { isSelected = !isSelected; }

    @Override
    public String toString()
    {
        return name;
    }

    public Ingredient()
    {
        this.isSelected = false;
    }

    public Ingredient(String name, Boolean isSelected)
    {
        this.name = name;
        this.isSelected = isSelected;
    }

    private String convertUOM(String uom) {

        String quantity = Integer.toString(getQuantity());

        if (uom.equals("number of")) {
            return "x" + quantity;
        }
        else if (uom.equals("grams")) {
            return quantity + "g";
        }
        else if (uom.equals("kilograms")) {
            return quantity + "kg";
        }
        else if (uom.equals("liters")) {
            return quantity + "l";
        }
        else if (uom.equals("milliliters")) {
            return quantity + "ml";
        }
        else if (uom.equals("pints")) {
            return quantity + "pt";
        }
        return uom;
    }
}
